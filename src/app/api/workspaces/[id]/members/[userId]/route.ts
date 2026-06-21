import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { updateMemberRoleSchema } from '@/types/member';

async function countOtherAdmins(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  excludeUserId: string,
): Promise<number> {
  const { count } = await supabase
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('role', 'admin')
    .neq('user_id', excludeUserId);
  return count ?? 0;
}

export const PATCH = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const targetUserId = ctx.params.userId;
  if (!targetUserId) {
    return NextResponse.json(
      { error: 'User ID required' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const body = await request.json();
  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { role: newRole } = parsed.data;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Member not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const start = Date.now();

  if (membership.role === 'admin' && newRole !== 'admin') {
    const otherAdmins = await countOtherAdmins(supabase, ctx.workspaceId, targetUserId);
    if (otherAdmins < 1) {
      return NextResponse.json(
        { error: 'Cannot demote the last admin' },
        { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
      );
    }
  }

  const { error: updateError } = await supabase
    .from('workspace_members')
    .update({ role: newRole })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);

  if (updateError) {
    log.error({ error: updateError }, 'Failed to update member role');
    return NextResponse.json(
      { error: 'Failed to update member role' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: updated } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId)
    .single();

  const duration = Date.now() - start;
  log.info({ targetUserId, newRole, duration }, 'Member role updated');

  return NextResponse.json(updated, {
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'workspace:admin');

export const DELETE = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const targetUserId = ctx.params.userId;
  if (!targetUserId) {
    return NextResponse.json(
      { error: 'User ID required' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Member not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const start = Date.now();

  if (membership.role === 'admin') {
    const otherAdmins = await countOtherAdmins(supabase, ctx.workspaceId, targetUserId);
    if (otherAdmins < 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last admin' },
        { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
      );
    }
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);

  if (error) {
    log.error({ error }, 'Failed to remove member');
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ targetUserId, duration }, 'Member removed');

  return NextResponse.json(
    { message: 'Member removed' },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'workspace:admin');
