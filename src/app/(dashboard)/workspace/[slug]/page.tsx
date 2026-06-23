'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRealtimePosts } from '@/hooks/useRealtimePosts';
import { usePresence } from '@/hooks/usePresence';
import { createClient } from '@/lib/supabase/client';
import { QueryPanel } from '@/components/workspace/query-panel';
import type { Post } from '@/types/post';

interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  members: { user_id: string; role: string }[];
  stats: { post_count: number };
}

export default function WorkspacePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | undefined>(undefined);
  const hasPaginatedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        setCurrentUserEmail(data.user.email ?? undefined);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const listRes = await fetch('/api/workspaces');
      if (cancelled || !listRes.ok) return;
      const allWorkspaces = await listRes.json();
      const ws = allWorkspaces.find(
        (w: { slug: string }) => w.slug === params.slug,
      );
      if (!ws) {
        router.push('/dashboard');
        return;
      }
      if (cancelled) return;
      setCurrentRole(ws.role);

      const [detailRes, postsRes] = await Promise.all([
        fetch(`/api/workspaces/${ws.id}`),
        fetch(`/api/workspaces/${ws.id}/posts`),
      ]);

      if (cancelled) return;

      if (detailRes.ok) {
        const detail = await detailRes.json();
        setWorkspace(detail);
      }

      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData.data);
        setNextCursor(postsData.next_cursor);
        setHasMore(postsData.has_more);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params.slug, router]);

  const handleRealtimeInsert = useCallback((post: Post) => {
    if (hasPaginatedRef.current) return;
    setPosts((prev) => {
      if (prev.some((p) => p.id === post.id)) return prev;
      return [post, ...prev];
    });
  }, []);

  const handleRealtimeDelete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  useRealtimePosts({
    workspaceId: workspace?.id ?? null,
    onInsert: handleRealtimeInsert,
    onDelete: handleRealtimeDelete,
  });

  const { onlineUsers } = usePresence({
    workspaceId: workspace?.id ?? null,
    userId: currentUserId,
    userEmail: currentUserEmail,
  });

  async function loadMore() {
    if (!workspace || !nextCursor) return;
    hasPaginatedRef.current = true;
    setLoadingMore(true);
    const res = await fetch(
      `/api/workspaces/${workspace.id}/posts?cursor=${encodeURIComponent(nextCursor)}`,
    );
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => [...prev, ...data.data]);
      setNextCursor(data.next_cursor);
      setHasMore(data.has_more);
    }
    setLoadingMore(false);
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError(null);
    setCreating(true);

    const res = await fetch(`/api/workspaces/${workspace.id}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || undefined,
        content,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to create post');
      setCreating(false);
      return;
    }

    const newPost = await res.json();
    setPosts((prev) => [newPost, ...prev]);
    setTitle('');
    setContent('');
    setCreating(false);
  }

  async function handleDeletePost(postId: string) {
    if (!workspace) return;
    setDeleteError(null);
    const res = await fetch(
      `/api/workspaces/${workspace.id}/posts/${postId}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to delete post' }));
      setDeleteError(data.error ?? 'Failed to delete post');
    }
  }

  const canCreatePost = currentRole === 'admin' || currentRole === 'member';
  const canDeleteAny = currentRole === 'admin';

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {workspace.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {workspace.members.length} member{workspace.members.length !== 1 ? 's' : ''} · {workspace.stats.post_count} post{workspace.stats.post_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onlineUsers.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex -space-x-2">
                {onlineUsers.slice(0, 5).map((user) => (
                  <Avatar
                    key={user.userId}
                    className="h-7 w-7 border-2 border-white dark:border-zinc-900"
                    title={user.email ?? user.userId}
                  >
                    <AvatarFallback className="bg-green-100 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                      {(user.email ?? user.userId).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {onlineUsers.length > 5 && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  +{onlineUsers.length - 5}
                </span>
              )}
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500" />
            </div>
          )}
          {currentRole === 'admin' && (
            <Button
              variant="outline"
              onClick={() => router.push(`/workspace/${params.slug}/settings`)}
            >
              Settings
            </Button>
          )}
        </div>
      </div>

      {canCreatePost && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleCreatePost} className="space-y-3">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="post-title">Title (optional)</Label>
                <Input
                  id="post-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Post title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="post-content">Content</Label>
                <Textarea
                  id="post-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share knowledge with your team..."
                  rows={4}
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={creating}>
                  {creating ? 'Posting...' : 'Post'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {deleteError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {deleteError}
        </div>
      )}

      <div className="space-y-4">
        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500 dark:text-zinc-400">
                No posts yet. Be the first to share something.
              </p>
            </CardContent>
          </Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  {post.title && (
                    <CardTitle className="text-base">{post.title}</CardTitle>
                  )}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(post.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      post.embedding_status === 'completed'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {post.embedding_status}
                  </Badge>
                  {canDeleteAny && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeletePost(post.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {post.content}
                </p>
              </CardContent>
            </Card>
          ))
        )}

        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      {workspace && <QueryPanel workspaceId={workspace.id} />}
    </div>
  );
}
