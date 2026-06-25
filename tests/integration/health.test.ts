import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

const mockRedis = {
  ping: vi.fn().mockResolvedValue('PONG'),
  get: vi.fn().mockResolvedValue(null),
};

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

import { GET } from '@/app/api/health/route';

function createRequest(): Request {
  return new Request('http://localhost:3000/api/health', {
    method: 'GET',
    headers: { 'x-request-id': 'test-health-correlation' },
  });
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.get.mockResolvedValue(new Date().toISOString());
  });

  it('returns healthy when all services are up', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.redis.status).toBe('up');
    expect(body.checks.worker.status).toBe('up');
  });

  it('returns degraded when one service is down', async () => {
    mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
    mockRedis.get.mockResolvedValue(new Date().toISOString());

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.redis.status).toBe('down');
    expect(body.checks.database.status).toBe('up');
  });

  it('returns unhealthy (503) when two+ services are down', async () => {
    mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
    mockRedis.get.mockRejectedValue(new Error('Connection refused'));
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ error: { message: 'DB down' } }),
      }),
    });

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('unhealthy');
  });

  it('returns degraded when worker heartbeat is stale', async () => {
    const staleTime = new Date(Date.now() - 200_000).toISOString();
    mockRedis.get.mockResolvedValue(staleTime);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.worker.status).toBe('down');
    expect(body.checks.worker.error).toContain('stale');
  });

  it('returns degraded when no worker heartbeat found', async () => {
    mockRedis.get.mockResolvedValue(null);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.status).toBe('degraded');
    expect(body.checks.worker.status).toBe('down');
    expect(body.checks.worker.error).toContain('No heartbeat');
  });

  it('includes version and uptime_seconds', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime_seconds');
    expect(typeof body.uptime_seconds).toBe('number');
  });

  it('returns X-Request-ID header', async () => {
    const response = await GET(createRequest());
    expect(response.headers.get('X-Request-ID')).toBe('test-health-correlation');
  });
});
