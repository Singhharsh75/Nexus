import { Queue } from 'bullmq';
import { env } from '@/lib/env';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

const queues = new Map<string, Queue>();

function getOrCreateQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, queue);
  }
  return queue;
}

export function getEmbedPostQueue(): Queue {
  return getOrCreateQueue('embed-post');
}

export function getWebhookDeliverQueue(): Queue {
  return getOrCreateQueue('webhook-deliver');
}

export interface EmbedPostJobData {
  postId: string;
  workspaceId: string;
  correlationId: string;
}

export interface WebhookDeliverJobData {
  webhookId: string;
  deliveryId: string;
  eventType: string;
  data: Record<string, unknown>;
  correlationId: string;
}
