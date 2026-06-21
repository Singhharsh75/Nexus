import { NextResponse } from 'next/server';
import { withAuth, type AuthenticatedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { createWorkspaceSchema } from '@/types/workspace';

export const POST = withAuth(async (request: Request, ctx: AuthenticatedRequest) => {
  const log = createRequestLogger(ctx.correlationId, { userId: ctx.user.sub });
  const supabase = createAdminClient();

  const body = await request.json();
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { name, slug } = parsed.data;
  const start = Date.now();

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name, slug, created_by: ctx.user.sub })
    .select()
    .single();

  if (wsError) {
    if (wsError.code === '23505') {
      return NextResponse.json(
        { error: 'A workspace with this slug already exists' },
        { status: 409, headers: { 'X-Request-ID': ctx.correlationId } },
      );
    }
    log.error({ error: wsError }, 'Failed to create workspace');
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: ctx.user.sub,
      role: 'admin',
    });

  if (memberError) {
    log.error({ error: memberError }, 'Failed to add creator as admin');
    await supabase.from('workspaces').delete().eq('id', workspace.id);
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ workspaceId: workspace.id, slug, duration }, 'Workspace created');

  return NextResponse.json(workspace, {
    status: 201,
    headers: { 'X-Request-ID': ctx.correlationId },
  });
});

export const GET = withAuth(async (request: Request, ctx: AuthenticatedRequest) => {
  const log = createRequestLogger(ctx.correlationId, { userId: ctx.user.sub });
  const supabase = createAdminClient();
  const start = Date.now();

  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, slug, created_by, created_at, updated_at)')
    .eq('user_id', ctx.user.sub);

  if (error) {
    log.error({ error }, 'Failed to list workspaces');
    return NextResponse.json(
      { error: 'Failed to list workspaces' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const workspaces = (memberships ?? []).map((m) => ({
    ...m.workspaces,
    role: m.role,
  }));

  const duration = Date.now() - start;
  log.info({ count: workspaces.length, duration }, 'Listed workspaces');

  return NextResponse.json(workspaces, {
    headers: { 'X-Request-ID': ctx.correlationId },
  });
});
