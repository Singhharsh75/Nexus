import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWebhookDeliverQueue, type WebhookDeliverJobData } from '@/lib/queue';
import { logger } from '@/lib/logger';
import type { WebhookEventType } from '@/types/webhook';

export async function dispatchWebhookEvent(
  workspaceId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
  correlationId: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: webhooks, error } = await supabase
    .from('workspace_webhooks')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .contains('events', [eventType]);

  if (error) {
    logger.error({ error, workspaceId, eventType, correlationId }, 'Failed to fetch webhooks for dispatch');
    return;
  }

  if (!webhooks || webhooks.length === 0) return;

  const queue = getWebhookDeliverQueue();

  const jobs = webhooks.map((webhook) => {
    const deliveryId = randomUUID();
    return {
      name: 'webhook-deliver',
      data: {
        webhookId: webhook.id,
        deliveryId,
        eventType,
        data,
        correlationId,
      } satisfies WebhookDeliverJobData,
      opts: {
        jobId: `wh-${webhook.id}-${eventType}-${deliveryId}`,
      },
    };
  });

  const deliveryRows = jobs.map((job) => ({
    id: job.data.deliveryId,
    webhook_id: job.data.webhookId,
    event_type: eventType,
    payload: { event: eventType, delivery_id: job.data.deliveryId, data },
    status: 'pending' as const,
    attempts: 0,
  }));

  const { error: insertError } = await supabase
    .from('webhook_deliveries')
    .insert(deliveryRows);

  if (insertError) {
    logger.error({ error: insertError, correlationId }, 'Failed to insert webhook delivery records');
    return;
  }

  try {
    await queue.addBulk(jobs);
  } catch (err) {
    logger.error({ error: err, correlationId }, 'Failed to enqueue webhook deliveries');
  }

  logger.info({ workspaceId, eventType, webhookCount: webhooks.length, correlationId }, 'Webhook events dispatched');
}
