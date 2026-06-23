import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { createAdminClient } from '../lib/supabase.js';
import { createJobLogger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import type { EmbedPostJobData } from './embed-post.js';

export interface ReindexWorkspaceJobData {
  workspaceId: string;
  correlationId: string;
}

export async function processReindexWorkspace(
  job: Job<ReindexWorkspaceJobData>,
): Promise<void> {
  const { workspaceId, correlationId } = job.data;
  const log = createJobLogger(job.id, correlationId, { workspaceId });
  const supabase = createAdminClient();

  log.info('Starting reindex-workspace job');

  const { data: posts, error } = await supabase
    .from('posts')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (error || !posts) {
    log.error({ error }, 'Failed to fetch posts for reindexing');
    throw new Error(`Failed to fetch posts: ${error?.message}`);
  }

  const embedQueue = new Queue('embed-post', {
    connection: { url: env.REDIS_URL },
  });

  for (const post of posts) {
    const jobData: EmbedPostJobData = {
      postId: post.id,
      workspaceId,
      correlationId,
    };
    await embedQueue.add('embed-post', jobData, {
      jobId: `reindex-${post.id}`,
    });
  }

  await embedQueue.close();

  log.info({ postCount: posts.length }, 'Reindex jobs enqueued');
}
