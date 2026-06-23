import type { Job } from 'bullmq';
import { createAdminClient } from '../lib/supabase.js';
import { getOpenRouterClient } from '../lib/openrouter.js';
import { createJobLogger } from '../lib/logger.js';
import { chunkText } from '../../src/lib/ai/chunker.js';
import { generateEmbeddings } from '../../src/lib/ai/embeddings.js';

export interface EmbedPostJobData {
  postId: string;
  workspaceId: string;
  correlationId: string;
}

export async function processEmbedPost(
  job: Job<EmbedPostJobData>,
): Promise<void> {
  const { postId, workspaceId, correlationId } = job.data;
  const log = createJobLogger(job.id, correlationId, { postId, workspaceId });
  const supabase = createAdminClient();
  const openrouter = getOpenRouterClient();
  const startTime = Date.now();

  log.info('Starting embed-post job');

  try {
    await supabase
      .from('posts')
      .update({ embedding_status: 'processing' })
      .eq('id', postId);

    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('id, title, content, workspace_id')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      log.warn({ error: fetchError }, 'Post not found, skipping');
      return;
    }

    const textToEmbed = [post.title, post.content].filter(Boolean).join('\n\n');
    const chunks = chunkText(textToEmbed);

    if (chunks.length === 0) {
      log.warn('No chunks generated from post content');
      await supabase
        .from('posts')
        .update({ embedding_status: 'completed' })
        .eq('id', postId);
      return;
    }

    const embeddingStart = Date.now();
    const embeddings = await generateEmbeddings(
      openrouter,
      chunks.map((c) => c.content),
    );
    const embeddingTimeMs = Date.now() - embeddingStart;

    await supabase.from('post_chunks').delete().eq('post_id', postId);

    const rows = chunks.map((chunk, i) => ({
      post_id: postId,
      workspace_id: workspaceId,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i]),
      metadata: { postId, chunkIndex: chunk.index },
    }));

    const { error: insertError } = await supabase
      .from('post_chunks')
      .insert(rows);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    await supabase
      .from('posts')
      .update({ embedding_status: 'completed' })
      .eq('id', postId);

    const totalTimeMs = Date.now() - startTime;
    log.info(
      { chunkCount: chunks.length, embeddingTimeMs, totalTimeMs },
      'Embedding completed',
    );
  } catch (error) {
    const { error: updateError } = await supabase
      .from('posts')
      .update({ embedding_status: 'failed' })
      .eq('id', postId);

    if (updateError) {
      log.error({ error: updateError }, 'Failed to mark post as failed');
    }

    log.error({ error }, 'Embedding failed');
    throw error;
  }
}
