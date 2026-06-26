import { createHash } from 'crypto';
import { getRedisClient } from '../redis';

const CACHE_TTL_SECONDS = 3600;
const CACHE_PREFIX = 'query-cache';

export interface CachedAnswer {
  answer: string;
  sources: CachedSource[];
  createdAt: string;
}

export interface CachedSource {
  postId: string;
  chunkId: string;
  content: string;
  similarity: number;
  title?: string;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function cacheKey(workspaceId: string, query: string): string {
  const hash = createHash('sha256')
    .update(normalizeQuery(query))
    .digest('hex');
  return `${CACHE_PREFIX}:${workspaceId}:${hash}`;
}

export async function getCachedAnswer(
  query: string,
  workspaceId: string,
): Promise<CachedAnswer | null> {
  try {
    const redis = getRedisClient();
    const key = cacheKey(workspaceId, query);
    const cached = await redis.get(key);

    if (!cached) return null;

    return JSON.parse(cached) as CachedAnswer;
  } catch {
    return null;
  }
}

export async function setCachedAnswer(
  query: string,
  workspaceId: string,
  data: CachedAnswer,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = cacheKey(workspaceId, query);
    await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Cache write failures are non-critical
  }
}
