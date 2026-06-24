import { z } from 'zod/v4';

export const webhookEventTypes = [
  'post.created',
  'member.joined',
  'query.completed',
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

export const createWebhookSchema = z.object({
  url: z.url(),
  events: z.array(z.enum(webhookEventTypes)).min(1),
  secret: z.string().min(16).max(256),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export interface Webhook {
  id: string;
  workspace_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  last_attempt_at: string | null;
  response_status: number | null;
  created_at: string;
}
