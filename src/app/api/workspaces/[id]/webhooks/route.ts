import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { createWebhookSchema } from '@/types/webhook';

export const GET = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const start = Date.now();

  const { data: webhooks, error } = await supabase
    .from('workspace_webhooks')
    .select('id, workspace_id, url, events, active, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    log.error({ error }, 'Failed to list webhooks');
    return NextResponse.json(
      { error: 'Failed to list webhooks' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ count: webhooks?.length ?? 0, duration }, 'Listed webhooks');

  return NextResponse.json(
    { data: webhooks ?? [] },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'webhook:manage');

export const POST = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const body = await request.json();
  const parsed = createWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { url, events, secret } = parsed.data;
  const start = Date.now();

  const { data: webhook, error } = await supabase
    .from('workspace_webhooks')
    .insert({
      workspace_id: ctx.workspaceId,
      url,
      events,
      secret,
      active: true,
    })
    .select('id, workspace_id, url, events, active, created_at')
    .single();

  if (error || !webhook) {
    log.error({ error }, 'Failed to create webhook');
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ webhookId: webhook.id, duration }, 'Webhook created');

  return NextResponse.json(webhook, {
    status: 201,
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'webhook:manage');
