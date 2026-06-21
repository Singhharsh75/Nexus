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

  const postId = ctx.params.postId;
  if (!postId) {
    return NextResponse.json(
      { error: 'Post ID required' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const start = Date.now();
  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .eq('workspace_id', ctx.workspaceId)
    .single();

  if (error || !post) {
    return NextResponse.json(
      { error: 'Post not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ postId, duration }, 'Fetched post');

  return NextResponse.json(post, {
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'workspace:read');

export const DELETE = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const postId = ctx.params.postId;
  if (!postId) {
    return NextResponse.json(
      { error: 'Post ID required' },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { data: post } = await supabase
    .from('posts')
    .select('id, author_id')
    .eq('id', postId)
    .eq('workspace_id', ctx.workspaceId)
    .single();

  if (!post) {
    return NextResponse.json(
      { error: 'Post not found' },
      { status: 404, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const isAuthor = post.author_id === ctx.user.sub;
  const isAdmin = ctx.role === 'admin';

  if (!isAuthor && !isAdmin) {
    return NextResponse.json(
      { error: 'Only the author or an admin can delete this post' },
      { status: 403, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const start = Date.now();
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (error) {
    log.error({ error, postId }, 'Failed to delete post');
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const duration = Date.now() - start;
  log.info({ postId, duration }, 'Post deleted');

  return NextResponse.json(
    { message: 'Post deleted' },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'post:delete');
