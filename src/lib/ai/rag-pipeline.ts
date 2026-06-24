import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { getOpenRouterClient } from './openrouter';
import { generateEmbeddings } from './embeddings';
import { getCachedAnswer, setCachedAnswer } from './semantic-cache';
import type { RAGEvent, Source } from '@/types/query';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatch';

const CHAT_MODEL = 'openai/gpt-4o-mini';

function buildSystemPrompt(sources: Source[]): string {
  const contextBlocks = sources
    .map((s, i) => `[${i + 1}] ${s.content}`)
    .join('\n\n');

  return `You are a knowledge assistant for a team workspace. Answer based ONLY on the provided context.
Cite sources using [1], [2], etc. corresponding to the context chunks below.
If the context doesn't contain enough information to answer the question, say so clearly.

Context:
${contextBlocks}`;
}

export async function* executeRAGQuery(params: {
  query: string;
  workspaceId: string;
  userId: string;
  correlationId: string;
}): AsyncGenerator<RAGEvent> {
  const { query, workspaceId, userId, correlationId } = params;
  const log = createRequestLogger(correlationId, { userId, workspaceId });
  const startTime = Date.now();

  const cached = await getCachedAnswer(query, workspaceId);
  if (cached) {
    log.info('Cache hit for query');
    yield { type: 'sources', sources: cached.sources };
    yield { type: 'delta', content: cached.answer };
    yield { type: 'done', cached: true, latencyMs: Date.now() - startTime };

    const cachedLatencyMs = Date.now() - startTime;

    recordQueryHistory({
      workspaceId,
      userId,
      queryText: query,
      answerText: cached.answer,
      sources: cached.sources,
      cached: true,
      latencyMs: cachedLatencyMs,
    }).catch((err) => log.error({ error: err }, 'Failed to record query history'));

    dispatchWebhookEvent(
      workspaceId,
      'query.completed',
      { user_id: userId, query: query.slice(0, 200), latency_ms: cachedLatencyMs, source_count: cached.sources.length, cached: true },
      correlationId,
    ).catch((err) => log.error({ error: err }, 'Failed to dispatch query.completed webhook'));

    return;
  }

  const client = getOpenRouterClient();

  let queryEmbedding: number[];
  try {
    const embeddings = await generateEmbeddings(client, [query]);
    queryEmbedding = embeddings[0];
  } catch (err) {
    log.error({ error: err }, 'Failed to generate query embedding');
    yield { type: 'error', message: 'Failed to process query' };
    return;
  }

  const supabase = createAdminClient();
  const { data: chunks, error: matchError } = await supabase.rpc(
    'match_chunks',
    {
      query_embedding: JSON.stringify(queryEmbedding),
      target_workspace_id: workspaceId,
      match_threshold: 0.3,
      match_count: 10,
    },
  );

  if (matchError) {
    log.error({ error: matchError }, 'Failed to search chunks');
    yield { type: 'error', message: 'Failed to search knowledge base' };
    return;
  }

  if (!chunks || chunks.length === 0) {
    yield {
      type: 'error',
      message:
        'Not enough context in the workspace to answer this question. Try adding more posts with relevant content.',
    };
    return;
  }

  const postIds = [...new Set(chunks.map((c: { post_id: string }) => c.post_id))];
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, title')
    .in('id', postIds);

  if (postsError) {
    log.error({ error: postsError }, 'Failed to fetch post titles');
  }

  const postTitleMap = new Map(
    (posts ?? []).map((p: { id: string; title: string | null }) => [p.id, p.title]),
  );

  const sources: Source[] = chunks.map(
    (c: {
      id: string;
      post_id: string;
      content: string;
      similarity: number;
    }) => ({
      postId: c.post_id,
      chunkId: c.id,
      content: c.content,
      similarity: c.similarity,
      title: postTitleMap.get(c.post_id) ?? undefined,
    }),
  );

  yield { type: 'sources', sources };

  const systemPrompt = buildSystemPrompt(sources);

  let fullAnswer = '';

  try {
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullAnswer += delta;
        yield { type: 'delta', content: delta };
      }
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to generate answer');
    yield { type: 'error', message: 'Failed to generate answer' };
    return;
  }

  const latencyMs = Date.now() - startTime;
  yield { type: 'done', cached: false, latencyMs };

  log.info({ latencyMs, sourceCount: sources.length }, 'RAG query completed');

  setCachedAnswer(query, workspaceId, {
    answer: fullAnswer,
    sources,
    createdAt: new Date().toISOString(),
  }).catch((err) => log.error({ error: err }, 'Failed to cache answer'));

  recordQueryHistory({
    workspaceId,
    userId,
    queryText: query,
    answerText: fullAnswer,
    sources,
    cached: false,
    latencyMs,
  }).catch((err) => log.error({ error: err }, 'Failed to record query history'));

  dispatchWebhookEvent(
    workspaceId,
    'query.completed',
    { user_id: userId, query: query.slice(0, 200), latency_ms: latencyMs, source_count: sources.length, cached: false },
    correlationId,
  ).catch((err) => log.error({ error: err }, 'Failed to dispatch query.completed webhook'));
}

async function recordQueryHistory(params: {
  workspaceId: string;
  userId: string;
  queryText: string;
  answerText: string | null;
  sources: Source[];
  cached: boolean;
  latencyMs: number;
}): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('query_history').insert({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    query_text: params.queryText,
    answer_text: params.answerText,
    sources: JSON.stringify(params.sources),
    cached: params.cached,
    latency_ms: params.latencyMs,
  });
}
