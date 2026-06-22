'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PresenceUser {
  userId: string;
  email?: string;
  onlineAt: string;
}

interface UsePresenceOptions {
  workspaceId: string | null;
  userId: string | null;
  userEmail?: string;
}

export function usePresence({ workspaceId, userId, userEmail }: UsePresenceOptions) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setOnlineUsers([]);
  }, []);

  useEffect(() => {
    if (!workspaceId || !userId) return;

    const supabase = createClient();

    const channel = supabase.channel(`presence:${workspaceId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = [];
        for (const presences of Object.values(state)) {
          if (presences.length > 0) {
            users.push(presences[0]);
          }
        }
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId,
            email: userEmail,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return cleanup;
  }, [workspaceId, userId, userEmail, cleanup]);

  return { onlineUsers };
}
