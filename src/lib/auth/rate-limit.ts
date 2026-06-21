import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS = {
  aiQuery: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
  api: { windowMs: 60 * 1000, maxRequests: 100 },
} as const;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const key = `ratelimit:${userId}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, config.windowMs);
  const results = await pipeline.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;

  if (count > config.maxRequests) {
    const oldestInWindow = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldestInWindow.length >= 2 ? Number(oldestInWindow[1]) : now;
    const retryAfterMs = oldestTimestamp + config.windowMs - now;

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1000),
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - count,
    retryAfterMs: null,
  };
}

export function rateLimitResponse(
  retryAfterMs: number,
  correlationId: string,
): NextResponse {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
        'X-Request-ID': correlationId,
      },
    },
  );
}
