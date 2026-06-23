import { Worker } from 'bullmq';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { processEmbedPost } from './jobs/embed-post.js';

const connection = { url: env.REDIS_URL };

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

async function shutdown() {
  logger.info('Shutting down worker...');
  await embedWorker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Worker started');
