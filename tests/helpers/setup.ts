import { vi } from 'vitest';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  'test-jwt-secret-that-is-at-least-32-characters-long',
);

export const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'testuser@example.com',
};

export const TEST_USER_2 = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'testuser2@example.com',
};

export const TEST_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Test Workspace',
  slug: 'test-workspace',
  created_by: TEST_USER.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function signTestAccessToken(
  userId: string,
  email: string,
): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function setAuthenticatedCookies(
  cookieStore: Map<string, string>,
  userId: string = TEST_USER.id,
  email: string = TEST_USER.email,
): Promise<void> {
  const token = await signTestAccessToken(userId, email);
  cookieStore.set('nexus-access-token', token);
}

export function createTestRequest(
  method: string,
  path: string,
  body?: unknown,
): Request {
  const init: RequestInit = {
    method,
    headers: { 'x-request-id': 'test-correlation-id' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  return new Request(`http://localhost:3000${path}`, init);
}

export function createRouteContext(
  params: Record<string, string>,
): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(params) };
}

export function mockSupabaseFrom(
  mockData: Record<string, { data: unknown; error: unknown }>,
) {
  const createChain = (tableName: string) => {
    const result = mockData[tableName] ?? { data: null, error: null };

    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
      'order', 'limit', 'range', 'single', 'maybeSingle',
      'is', 'not', 'match', 'filter', 'contains',
      'textSearch', 'or', 'and',
    ];

    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    chain.single = vi.fn().mockResolvedValue(result);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);

    const selectFn = vi.fn().mockImplementation(() => {
      const selectChain = { ...chain };
      selectChain.then = (resolve: (val: unknown) => void) =>
        resolve(result);
      return selectChain;
    });
    chain.select = selectFn;

    const insertFn = vi.fn().mockImplementation(() => chain);
    chain.insert = insertFn;

    const updateFn = vi.fn().mockImplementation(() => chain);
    chain.update = updateFn;

    const deleteFn = vi.fn().mockImplementation(() => chain);
    chain.delete = deleteFn;

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => createChain(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { id: TEST_USER.id, email: TEST_USER.email } },
          error: null,
        }),
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: TEST_USER.id, email: TEST_USER.email } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ data: null, error: null }),
        listUsers: vi.fn().mockResolvedValue({
          data: { users: [] },
          error: null,
        }),
      },
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: TEST_USER.id, email: TEST_USER.email },
          session: { access_token: 'test-session-token' },
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

export function mockRedisClient(overrides: Record<string, unknown> = {}) {
  return {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0], [null, 1], [null, 1], [null, 1]]),
    }),
    zadd: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

export function mockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    addBulk: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
