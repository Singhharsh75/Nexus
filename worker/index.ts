import { Worker } from 'bullmq';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { getRedisClient } from './lib/redis.js';
import { processEmbedPost } from './jobs/embed-post.js';
import { processWebhookDeliver } from './jobs/webhook-deliver.js';

const connection = { url: env.REDIS_URL };
const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat() {
  const redis = getRedisClient();
  const beat = () => {
    redis.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', 120).catch((err) => {
      logger.error({ error: err }, 'Failed to write heartbeat');
    });
  };
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
}

startHeartbeat();

const embedWorker = new Worker('embed-post', processEmbedPost, {
  connection,
  concurrency: 5,
});

embedWorker.on('completed', (job) => {
  logger.info({ jobId: job?.id }, 'embed-post job completed');
});

embedWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'embed-post job failed');
});

const webhookWorker = new Worker('webhook-deliver', processWebhookDeliver, {
  connection,
  concurrency: 10,
});

webhookWorker.on('completed', (job) => {
  logger.info({ jobId: job?.id }, 'webhook-deliver job completed');
});

webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'webhook-deliver job failed');
});

async function shutdown() {
  logger.info('Shutting down worker...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await Promise.all([embedWorker.close(), webhookWorker.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Worker started');
