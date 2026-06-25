import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearTestCookies, getTestCookieStore } from '../helpers/vitest-setup';
import {
  createTestRequest,
  createRouteContext,
  setAuthenticatedCookies,
  TEST_USER,
  TEST_WORKSPACE,
} from '../helpers/setup';

function buildChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains',
    'order', 'limit', 'range', 'is', 'not', 'match', 'filter', 'or',
  ];
  for (const m of methods) chain[m] = vi.fn(self);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

const mockSupabase = {
  from: vi.fn().mockImplementation(() =>
    buildChain({ data: { role: 'admin' }, error: null }),
  ),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

const mockRateLimit = vi.fn().mockResolvedValue({
  allowed: true,
  remaining: 19,
  retryAfterMs: null,
});

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
  RATE_LIMITS: {
    aiQuery: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
    api: { windowMs: 60 * 1000, maxRequests: 100 },
  },
  rateLimitResponse: vi.fn().mockImplementation((retryAfterMs: number, correlationId: string) => {
    const { NextResponse } = require('next/server');
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfterSeconds.toString(),
          'X-Request-ID': correlationId,
        },
      },
    );
  }),
}));

const mockRAGEvents = [
  {
    type: 'sources',
    sources: [
      { postId: 'p1', chunkId: 'c1', content: 'Test chunk', similarity: 0.85, title: 'Test Post' },
    ],
  },
  { type: 'delta', content: 'The answer is ' },
  { type: 'delta', content: '42.' },
  { type: 'done', cached: false, latencyMs: 150 },
];

const mockExecuteRAGQuery = vi.fn().mockImplementation(async function* () {
  for (const event of mockRAGEvents) {
    yield event;
  }
});

vi.mock('@/lib/ai/rag-pipeline', () => ({
  executeRAGQuery: (...args: unknown[]) => mockExecuteRAGQuery(...args),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
  })),
}));

import { POST as queryHandler } from '@/app/api/workspaces/[id]/query/route';

async function readSSEStream(response: Response): Promise<Record<string, unknown>[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        events.push(JSON.parse(trimmed.slice(6)));
      }
    }
  }

  return events;
}

describe('POST /api/workspaces/:id/query', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearTestCookies();
    await setAuthenticatedCookies(getTestCookieStore());

    mockSupabase.from.mockImplementation(() =>
      buildChain({ data: { role: 'admin' }, error: null }),
    );
    mockRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 19,
      retryAfterMs: null,
    });
    mockExecuteRAGQuery.mockImplementation(async function* () {
      for (const event of mockRAGEvents) {
        yield event;
      }
    });
  });

  it('returns SSE stream with sources, delta, and done events', async () => {
    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'What is the meaning of life?',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await readSSEStream(response);

    expect(events.length).toBe(4);
    expect(events[0].type).toBe('sources');
    expect(events[1].type).toBe('delta');
    expect(events[2].type).toBe('delta');
    expect(events[3].type).toBe('done');
  });

  it('returns cached result marker', async () => {
    mockExecuteRAGQuery.mockImplementation(async function* () {
      yield { type: 'sources', sources: [] };
      yield { type: 'delta', content: 'Cached answer' };
      yield { type: 'done', cached: true, latencyMs: 5 };
    });

    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'cached query',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));
    const events = await readSSEStream(response);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent?.cached).toBe(true);
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30000,
    });

    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'rate limited query',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('returns 400 on invalid query', async () => {
    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {});
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));

    expect(response.status).toBe(400);
  });

  it('returns 403 for non-member', async () => {
    mockSupabase.from.mockImplementation(() =>
      buildChain({ data: null, error: { code: 'PGRST116' } }),
    );

    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'test',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));

    expect(response.status).toBe(403);
  });

  it('returns X-Request-ID header', async () => {
    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'test query',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));

    expect(response.headers.get('X-Request-ID')).toBe('test-correlation-id');
  });

  it('handles stream error gracefully', async () => {
    mockExecuteRAGQuery.mockImplementation(async function* () {
      yield { type: 'sources', sources: [] };
      throw new Error('LLM connection failed');
    });

    const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/query`, {
      query: 'failing query',
    });
    const response = await queryHandler(request, createRouteContext({ id: TEST_WORKSPACE.id }));
    const events = await readSSEStream(response);

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.message).toBe('Internal error');
  });
});
