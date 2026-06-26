import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_ROUTES = ['/login', '/signup', '/api/auth/callback', '/api/health'];
const ACCESS_TOKEN_COOKIE = 'nexus-access-token';
const REFRESH_TOKEN_COOKIE = 'nexus-refresh-token';

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function middleware(request: NextRequest) {
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  let isAuthenticated = false;

  if (accessToken) {
    try {
      await jwtVerify(accessToken, getSecret());
      isAuthenticated = true;
    } catch {
      // Token expired or invalid
    }
  }

  // If JWT expired but refresh token exists, let the page load —
  // client-side apiFetch will handle 401 → refresh on the first API call.
  // This prevents redirect loops when the access token expires.
  const hasSession = isAuthenticated || !!refreshToken;

  if (!hasSession && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
