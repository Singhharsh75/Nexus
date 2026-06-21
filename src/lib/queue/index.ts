import { Queue } from 'bullmq';
import { env } from '@/lib/env';

let embedPostQueue: Queue | null = null;

export function getEmbedPostQueue(): Queue {
  if (!embedPostQueue) {
    embedPostQueue = new Queue('embed-post', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return embedPostQueue;
}

export interface EmbedPostJobData {
  postId: string;
  workspaceId: string;
  correlationId: string;
}
