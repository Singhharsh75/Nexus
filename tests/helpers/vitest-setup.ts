import { vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-placeholder';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key-placeholder';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
(process.env as Record<string, string>).NODE_ENV = 'test';

const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string, _options?: Record<string, unknown>) => {
      if (value === '' || (_options && _options.maxAge === 0)) {
        cookieStore.delete(name);
      } else {
        cookieStore.set(name, value);
      }
    },
    getAll: () =>
      Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
    delete: (name: string) => {
      cookieStore.delete(name);
    },
    has: (name: string) => cookieStore.has(name),
  })),
  headers: vi.fn().mockImplementation(async () => new Headers()),
}));

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  init: vi.fn(),
  withSentryConfig: vi.fn((config: unknown) => config),
}));

export function getTestCookieStore(): Map<string, string> {
  return cookieStore;
}

export function clearTestCookies(): void {
  cookieStore.clear();
}
