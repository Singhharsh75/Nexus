import type { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { createAdminClient } from '../lib/supabase.js';
import { createJobLogger } from '../lib/logger.js';

export interface WebhookDeliverJobData {
  webhookId: string;
  deliveryId: string;
  eventType: string;
  data: Record<string, unknown>;
  correlationId: string;
}

export async function processWebhookDeliver(
  job: Job<WebhookDeliverJobData>,
): Promise<void> {
  const { webhookId, deliveryId, eventType, data, correlationId } = job.data;
  const log = createJobLogger(job.id, correlationId, { webhookId, eventType, deliveryId });
  const supabase = createAdminClient();
  const attemptNumber = (job.attemptsMade ?? 0) + 1;

  log.info({ attemptNumber }, 'Starting webhook delivery');

  const { data: webhook, error: fetchError } = await supabase
    .from('workspace_webhooks')
    .select('id, url, secret, active')
    .eq('id', webhookId)
    .single();

  if (fetchError || !webhook) {
    log.warn({ error: fetchError }, 'Webhook not found, marking delivery failed');
    await supabase
      .from('webhook_deliveries')
      .update({ status: 'failed', attempts: attemptNumber, last_attempt_at: new Date().toISOString() })
      .eq('id', deliveryId);
    return;
  }

  if (!webhook.active) {
    log.info('Webhook is inactive, marking delivery failed');
    await supabase
      .from('webhook_deliveries')
      .update({ status: 'failed', attempts: attemptNumber, last_attempt_at: new Date().toISOString() })
      .eq('id', deliveryId);
    return;
  }

  const timestamp = new Date().toISOString();
  const payloadObj = {
    event: eventType,
    delivery_id: deliveryId,
    timestamp,
    data,
  };
  const payload = JSON.stringify(payloadObj);

  const signature = createHmac('sha256', webhook.secret)
    .update(payload)
    .digest('hex');

  await supabase
    .from('webhook_deliveries')
    .update({ payload: payloadObj })
    .eq('id', deliveryId);

  const startTime = Date.now();

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Event': eventType,
        'X-Nexus-Signature': `sha256=${signature}`,
        'X-Nexus-Delivery-ID': deliveryId,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'delivered',
          attempts: attemptNumber,
          last_attempt_at: new Date().toISOString(),
          response_status: response.status,
        })
        .eq('id', deliveryId);

      log.info({ status: response.status, attemptNumber, latencyMs }, 'Webhook delivered');
      return;
    }

    log.warn({ status: response.status, attemptNumber, latencyMs }, 'Webhook delivery received non-2xx response');

    await supabase
      .from('webhook_deliveries')
      .update({
        status: attemptNumber >= 3 ? 'failed' : 'pending',
        attempts: attemptNumber,
        last_attempt_at: new Date().toISOString(),
        response_status: response.status,
      })
      .eq('id', deliveryId);

    throw new Error(`Webhook returned ${response.status}`);
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Error && error.message.startsWith('Webhook returned')) {
      throw error;
    }

    await supabase
      .from('webhook_deliveries')
      .update({
        status: attemptNumber >= 3 ? 'failed' : 'pending',
        attempts: attemptNumber,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    log.error({ error, attemptNumber, latencyMs }, 'Webhook delivery failed');
    throw error;
  }
}
