import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { updateWorkspaceSchema } from '@/types/workspace';

export const GET = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const start = Date.now();

  const [workspaceResult, membersResult, postCountResult] = await Promise.all([
    supabase
      .from('workspaces')
      .select('*')
      .eq('id', ctx.workspaceId)
      .single(),
    supabase
      .from('workspace_members')
      .select('user_id, role, joined_at')
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspaceId),
  ]);

  if (workspaceResult.error || !workspaceResult.data) {
    return NextResponse.json(
      { error: 'Workspace not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ duration }, 'Fetched workspace details');

  return NextResponse.json(
    {
      ...workspaceResult.data,
      members: membersResult.data ?? [],
      stats: { post_count: postCountResult.count ?? 0 },
    },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'workspace:read');

export const PATCH = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const body = await request.json();
  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const updates = parsed.data;
  if (!updates.name && !updates.slug) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const start = Date.now();
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', ctx.workspaceId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A workspace with this slug already exists' },
        { status: 409, headers: { 'X-Request-ID': ctx.correlationId } },
      );
    }
    log.error({ error }, 'Failed to update workspace');
    return NextResponse.json(
      { error: 'Failed to update workspace' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  if (!workspace) {
    return NextResponse.json(
      { error: 'Workspace not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ duration, updates: Object.keys(updates) }, 'Workspace updated');

  return NextResponse.json(workspace, {
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'workspace:admin');

export const DELETE = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const start = Date.now();

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', ctx.workspaceId);

  if (error) {
    log.error({ error }, 'Failed to delete workspace');
    return NextResponse.json(
      { error: 'Failed to delete workspace' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ duration }, 'Workspace deleted');

  return NextResponse.json(
    { message: 'Workspace deleted' },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'workspace:admin');
