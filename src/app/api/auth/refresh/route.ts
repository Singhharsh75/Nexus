import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signAccessToken } from '@/lib/auth/jwt';
import { rotateRefreshToken } from '@/lib/auth/refresh-tokens';
import { setAuthCookies, getRefreshToken, clearAuthCookies } from '@/lib/auth/cookies';
import { getCorrelationId, createRequestLogger } from '@/lib/logger';

export async function POST(request: Request) {
  const correlationId = getCorrelationId(request.headers);
  const log = createRequestLogger(correlationId, {
    method: 'POST',
    path: '/api/auth/refresh',
  });

  try {
    const currentRefreshToken = await getRefreshToken();

    if (!currentRefreshToken) {
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const result = await rotateRefreshToken(currentRefreshToken);

    if (!result.valid) {
      await clearAuthCookies();

      if (result.reason === 'revoked_reuse_detected') {
        log.warn('Refresh token reuse detected — entire family revoked');
      }

      return NextResponse.json(
        { error: 'Invalid refresh token', reason: result.reason },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const supabase = createAdminClient();
    const { data: userData } = await supabase.auth.admin.getUserById(
      result.userId,
    );

    if (!userData.user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const accessToken = await signAccessToken({
      userId: result.userId,
      email: userData.user.email ?? '',
    });

    await setAuthCookies({
      accessToken,
      refreshToken: result.newRefreshToken,
    });

    log.info({ userId: result.userId }, 'Token refreshed');

    return NextResponse.json(
      { user: { id: result.userId, email: userData.user.email } },
      { status: 200, headers: { 'X-Request-ID': correlationId } },
    );
  } catch (err) {
    log.error({ err }, 'Refresh error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'X-Request-ID': correlationId } },
    );
  }
}
