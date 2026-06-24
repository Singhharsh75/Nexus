import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';

export const DELETE = withRole(async (request: Request, ctx: AuthorizedRequest) => {
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

  const { error } = await supabase
    .from('workspace_webhooks')
    .delete()
    .eq('id', webhookId);

  if (error) {
    log.error({ error, webhookId }, 'Failed to delete webhook');
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  log.info({ webhookId }, 'Webhook deleted');

  return NextResponse.json(
    { deleted: true },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'webhook:manage');
