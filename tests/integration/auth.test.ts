import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTestCookieStore, clearTestCookies } from '../helpers/vitest-setup';
import { createTestRequest, TEST_USER } from '../helpers/setup';

const mockRefreshTokensTable: Record<string, unknown>[] = [];
let mockSignInResult: { data: unknown; error: unknown } = {
  data: {
    user: { id: TEST_USER.id, email: TEST_USER.email },
    session: { access_token: 'session-token' },
  },
  error: null,
};

const mockSupabase = {
  from: vi.fn().mockImplementation((table: string) => {
    if (table === 'refresh_tokens') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(async () => {
              const token = mockRefreshTokensTable[0];
              return { data: token ?? null, error: token ? null : { code: 'PGRST116' } };
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  }),
  auth: {
    signInWithPassword: vi.fn().mockImplementation(async () => mockSignInResult),
    admin: {
      getUserById: vi.fn().mockResolvedValue({
        data: { user: { id: TEST_USER.id, email: TEST_USER.email } },
        error: null,
      }),
    },
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
  })),
}));

import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as refreshHandler } from '@/app/api/auth/refresh/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTestCookies();
    mockSignInResult = {
      data: {
        user: { id: TEST_USER.id, email: TEST_USER.email },
        session: { access_token: 'session-token' },
      },
      error: null,
    };
  });

  it('returns 200 with user data on valid credentials', async () => {
    const request = createTestRequest('POST', '/api/auth/login', {
      email: TEST_USER.email,
      password: 'password123',
    });

    const response = await loginHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.id).toBe(TEST_USER.id);
    expect(body.user.email).toBe(TEST_USER.email);

    const cookies = getTestCookieStore();
    expect(cookies.has('nexus-access-token')).toBe(true);
    expect(cookies.has('nexus-refresh-token')).toBe(true);
  });

  it('returns 401 on invalid credentials', async () => {
    mockSignInResult = {
      data: { user: null, session: null },
      error: { message: 'Invalid credentials' },
    };

    const request = createTestRequest('POST', '/api/auth/login', {
      email: TEST_USER.email,
      password: 'wrong',
    });

    const response = await loginHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 400 on malformed body', async () => {
    const request = createTestRequest('POST', '/api/auth/login', {
      email: 'not-an-email',
    });

    const response = await loginHandler(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const request = createTestRequest('POST', '/api/auth/login', {});

    const response = await loginHandler(request);
    expect(response.status).toBe(400);
  });

  it('returns X-Request-ID header', async () => {
    const request = createTestRequest('POST', '/api/auth/login', {
      email: TEST_USER.email,
      password: 'password123',
    });

    const response = await loginHandler(request);
    expect(response.headers.get('X-Request-ID')).toBe('test-correlation-id');
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTestCookies();
    mockRefreshTokensTable.length = 0;
  });

  it('returns 200 with new tokens on valid refresh', async () => {
    const cookies = getTestCookieStore();
    cookies.set('nexus-refresh-token', 'valid-refresh-token');

    mockRefreshTokensTable.push({
      id: 'token-1',
      user_id: TEST_USER.id,
      token_hash: 'some-hash',
      family_id: 'family-1',
      revoked: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const response = await refreshHandler(createTestRequest('POST', '/api/auth/refresh'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(TEST_USER.id);
    expect(body.user.email).toBe(TEST_USER.email);

    expect(cookies.get('nexus-access-token')).toBeDefined();
    expect(cookies.get('nexus-refresh-token')).toBeDefined();
  });

  it('returns 401 when no refresh token cookie', async () => {
    const request = createTestRequest('POST', '/api/auth/refresh');

    const response = await refreshHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('No refresh token');
  });

  it('returns 401 with reason when token is invalid', async () => {
    const cookies = getTestCookieStore();
    cookies.set('nexus-refresh-token', 'invalid-token');

    const request = createTestRequest('POST', '/api/auth/refresh');

    const response = await refreshHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.reason).toBe('invalid');
  });

  it('detects replay attack and returns revoked_reuse_detected', async () => {
    const cookies = getTestCookieStore();
    cookies.set('nexus-refresh-token', 'reused-token');

    mockRefreshTokensTable.push({
      id: 'token-1',
      user_id: TEST_USER.id,
      token_hash: 'some-hash',
      family_id: 'family-1',
      revoked: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const response = await refreshHandler(createTestRequest('POST', '/api/auth/refresh'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.reason).toBe('revoked_reuse_detected');
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTestCookies();
  });

  it('revokes token family and clears cookies', async () => {
    const cookies = getTestCookieStore();
    cookies.set('nexus-refresh-token', 'some-token');
    cookies.set('nexus-access-token', 'some-access');

    mockRefreshTokensTable.length = 0;
    mockRefreshTokensTable.push({ family_id: 'family-1' });

    const response = await logoutHandler(createTestRequest('POST', '/api/auth/logout'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(cookies.has('nexus-access-token')).toBe(false);
    expect(cookies.has('nexus-refresh-token')).toBe(false);
  });

  it('returns 200 even without refresh token', async () => {
    const response = await logoutHandler(createTestRequest('POST', '/api/auth/logout'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 200 even on internal errors (never leaks failures)', async () => {
    const cookies = getTestCookieStore();
    cookies.set('nexus-refresh-token', 'error-token');

    mockSupabase.from.mockImplementationOnce(() => {
      throw new Error('DB connection lost');
    });

    const response = await logoutHandler(createTestRequest('POST', '/api/auth/logout'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
