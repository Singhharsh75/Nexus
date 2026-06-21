import { NextResponse } from 'next/server';
import { clearAuthCookies, getRefreshToken } from '@/lib/auth/cookies';
import { hashToken } from '@/lib/auth/refresh-tokens';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCorrelationId, createRequestLogger } from '@/lib/logger';

export async function POST(request: Request) {
  const correlationId = getCorrelationId(request.headers);
  const log = createRequestLogger(correlationId, {
    method: 'POST',
    path: '/api/auth/logout',
  });

  try {
    const refreshToken = await getRefreshToken();

    if (refreshToken) {
      const supabase = createAdminClient();
      const tokenHash = hashToken(refreshToken);

      const { data: existing } = await supabase
        .from('refresh_tokens')
        .select('family_id')
        .eq('token_hash', tokenHash)
        .single();

      if (existing) {
        await supabase
          .from('refresh_tokens')
          .update({ revoked: true })
          .eq('family_id', existing.family_id);
      }
    }

    await clearAuthCookies();

    log.info('User logged out');

    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'X-Request-ID': correlationId } },
    );
  } catch (err) {
    log.error({ err }, 'Logout error');
    await clearAuthCookies();
    return NextResponse.json(
      { success: true },
      { status: 200, headers: { 'X-Request-ID': correlationId } },
    );
  }
}
