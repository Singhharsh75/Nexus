'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        fetch('/api/auth/refresh', { method: 'POST' }).then((res) => {
          if (!res.ok) {
            router.push('/login');
          }
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
