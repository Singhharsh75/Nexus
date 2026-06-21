import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createAdminClient } from '@/lib/supabase/admin';
import { signAccessToken } from '@/lib/auth/jwt';
import { createTokenFamily } from '@/lib/auth/refresh-tokens';
import { setAuthCookies } from '@/lib/auth/cookies';
import { getCorrelationId, createRequestLogger } from '@/lib/logger';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const correlationId = getCorrelationId(request.headers);
  const log = createRequestLogger(correlationId, {
    method: 'POST',
    path: '/api/auth/login',
  });

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const { email, password } = parsed.data;

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      log.warn({ email }, 'Login failed');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const accessToken = await signAccessToken({
      userId: data.user.id,
      email: data.user.email ?? email,
    });

    const { refreshToken } = await createTokenFamily(data.user.id);

    await setAuthCookies({ accessToken, refreshToken });

    log.info({ userId: data.user.id }, 'Login successful');

    return NextResponse.json(
      { user: { id: data.user.id, email: data.user.email } },
      { status: 200, headers: { 'X-Request-ID': correlationId } },
    );
  } catch (err) {
    log.error({ err }, 'Login error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'X-Request-ID': correlationId } },
    );
  }
}
