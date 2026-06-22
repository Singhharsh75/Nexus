'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Post } from '@/types/post';

interface UseRealtimePostsOptions {
  workspaceId: string | null;
  onInsert: (post: Post) => void;
  onDelete: (postId: string) => void;
}

export function useRealtimePosts({
  workspaceId,
  onInsert,
  onDelete,
}: UseRealtimePostsOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onInsertRef = useRef(onInsert);
  const onDeleteRef = useRef(onDelete);

  onInsertRef.current = onInsert;
  onDeleteRef.current = onDelete;

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`posts:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onInsertRef.current(payload.new as Post);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'posts',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onDeleteRef.current((payload.old as { id: string }).id);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return cleanup;
  }, [workspaceId, cleanup]);
}
