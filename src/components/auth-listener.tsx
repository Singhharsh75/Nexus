'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Catches session invalidation that the JWT cookie flow can't see, e.g. a
 * Supabase session signed out elsewhere while this tab's Realtime connection
 * is still open.
 */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
