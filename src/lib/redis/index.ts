import Redis from 'ioredis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
    redis.on('error', (err) => {
      logger.error({ error: err.message }, 'Redis connection error');
    });
  }
  return redis;
}
