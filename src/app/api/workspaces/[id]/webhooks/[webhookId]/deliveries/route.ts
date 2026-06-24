import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';

export const GET = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const webhookId = ctx.params.webhookId;

  if (!webhookId) {
    return NextResponse.json(
      { error: 'Webhook ID required' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: webhook, error: fetchError } = await supabase
    .from('workspace_webhooks')
    .select('id')
    .eq('id', webhookId)
    .eq('workspace_id', ctx.workspaceId)
    .single();

  if (fetchError || !webhook) {
    return NextResponse.json(
      { error: 'Webhook not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);

  const { data: deliveries, error } = await supabase
    .from('webhook_deliveries')
    .select('id, webhook_id, event_type, payload, status, attempts, last_attempt_at, response_status, created_at')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error({ error, webhookId }, 'Failed to list deliveries');
    return NextResponse.json(
      { error: 'Failed to list deliveries' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  log.info({ webhookId, count: deliveries?.length ?? 0 }, 'Listed webhook deliveries');

  return NextResponse.json(
    { data: deliveries ?? [] },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'webhook:manage');
