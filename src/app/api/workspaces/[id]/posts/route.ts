import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/logger';
import { createPostSchema } from '@/types/post';
import { getEmbedPostQueue, type EmbedPostJobData } from '@/lib/queue';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const GET = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();
  const start = Date.now();

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(
    Math.max(parseInt(limitParam ?? '', 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );

  let query = supabase
    .from('posts')
    .select('id, workspace_id, author_id, title, content, embedding_status, created_at, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: posts, error } = await query;

  if (error) {
    log.error({ error }, 'Failed to list posts');
    return NextResponse.json(
      { error: 'Failed to list posts' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const hasMore = (posts?.length ?? 0) > limit;
  const items = (posts ?? []).slice(0, limit);
  const nextCursor = hasMore ? items[items.length - 1]?.created_at : null;

  const duration = Date.now() - start;
  log.info({ count: items.length, hasMore, duration }, 'Listed posts');

  return NextResponse.json(
    { data: items, next_cursor: nextCursor, has_more: hasMore },
    { headers: { 'X-Request-ID': ctx.correlationId } },
  );
}, 'workspace:read');

export const POST = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });
  const supabase = createAdminClient();

  const body = await request.json();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const { title, content } = parsed.data;
  const start = Date.now();

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      workspace_id: ctx.workspaceId,
      author_id: ctx.user.sub,
      title: title ?? null,
      content,
      embedding_status: 'pending',
    })
    .select()
    .single();

  if (error || !post) {
    log.error({ error }, 'Failed to create post');
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  try {
    const jobData: EmbedPostJobData = {
      postId: post.id,
      workspaceId: ctx.workspaceId,
      correlationId: ctx.correlationId,
    };
    await getEmbedPostQueue().add('embed-post', jobData, {
      jobId: `embed-${post.id}`,
    });
    log.info({ postId: post.id }, 'Enqueued embed-post job');
  } catch (queueError) {
    log.error({ error: queueError, postId: post.id }, 'Failed to enqueue embed-post job');
  }

  const duration = Date.now() - start;
  log.info({ postId: post.id, duration }, 'Post created');

  return NextResponse.json(post, {
    status: 201,
    headers: { 'X-Request-ID': ctx.correlationId },
  });
}, 'post:create');
