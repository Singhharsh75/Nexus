import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { inviteMemberSchema } from '@/types/member';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatch';

export const GET = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const start = Date.now();

  const { data: members, error } = await supabase
    .from('workspace_members')
    .select('id, user_id, role, joined_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('joined_at', { ascending: true });

  if (error) {
    log.error({ error }, 'Failed to list members');
    return NextResponse.json(
      { error: 'Failed to list members' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const enriched = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return { ...m, email: data?.user?.email ?? null };
    }),
  );

  const duration = Date.now() - start;
  log.info({ count: enriched.length, duration }, 'Listed members');

  return NextResponse.json(enriched, {
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'workspace:read');

export const POST = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const body = await request.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { email, role } = parsed.data;
  const start = Date.now();

  const { data: userList, error: lookupError } = await supabase.rpc('get_user_id_by_email', {
    lookup_email: email,
  });

  let targetUserId: string | null = null;

  if (!lookupError && userList && userList.length > 0) {
    targetUserId = userList[0].id;
  } else {
    let page = 0;
    const perPage = 1000;
    let found = false;
    while (!found) {
      const { data: users } = await supabase.auth.admin.listUsers({ page: page + 1, perPage });
      if (!users?.users?.length) break;
      const match = users.users.find((u) => u.email === email);
      if (match) {
        targetUserId = match.id;
        found = true;
      }
      if (users.users.length < perPage) break;
      page++;
    }
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: 'User not found. They must sign up first.' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: existing } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'User is already a member of this workspace' },
      { status: 409, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: member, error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: ctx.workspaceId,
      user_id: targetUserId,
      role,
    })
    .select()
    .single();

  if (error || !member) {
    log.error({ error }, 'Failed to add member');
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  dispatchWebhookEvent(
    ctx.workspaceId,
    'member.joined',
    { user_id: targetUserId, email, role },
    ctx.correlationId,
  ).catch((err) => log.error({ error: err }, 'Failed to dispatch member.joined webhook'));

  const duration = Date.now() - start;
  log.info({ memberId: member.id, targetUserId, role, duration }, 'Member added');

  return NextResponse.json({ ...member, email }, {
    status: 201,
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'workspace:admin');
