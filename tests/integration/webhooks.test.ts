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

let fromCallCount = 0;
let mockTableResponses: Array<{ data: unknown; error: unknown }> = [];

const mockSupabase = {
  from: vi.fn().mockImplementation(() => {
    const idx = fromCallCount++;
    const result = mockTableResponses[idx] ?? { data: null, error: null };
    return buildChain(result);
  }),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
  })),
}));

vi.mock('@/lib/queue', () => ({
  getEmbedPostQueue: vi.fn(() => ({ add: vi.fn() })),
  getWebhookDeliverQueue: vi.fn(() => ({ add: vi.fn(), addBulk: vi.fn() })),
}));

import { GET as listWebhooks, POST as createWebhook } from '@/app/api/workspaces/[id]/webhooks/route';
import { DELETE as deleteWebhook } from '@/app/api/workspaces/[id]/webhooks/[webhookId]/route';
import { GET as listDeliveries } from '@/app/api/workspaces/[id]/webhooks/[webhookId]/deliveries/route';

const TEST_WEBHOOK = {
  id: '00000000-0000-0000-0000-000000000030',
  workspace_id: TEST_WORKSPACE.id,
  url: 'https://example.com/webhook',
  events: ['post.created'],
  active: true,
  created_at: new Date().toISOString(),
};

describe('Webhooks', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearTestCookies();
    fromCallCount = 0;
    mockTableResponses = [];
    await setAuthenticatedCookies(getTestCookieStore());
  });

  describe('GET /api/workspaces/:id/webhooks', () => {
    it('lists webhooks for admin', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: [TEST_WEBHOOK], error: null },
      ];

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`);
      const response = await listWebhooks(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('returns 403 for member (needs webhook:manage)', async () => {
      mockTableResponses = [
        { data: { role: 'member' }, error: null },
      ];

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`);
      const response = await listWebhooks(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });

    it('returns 403 for viewer', async () => {
      mockTableResponses = [
        { data: { role: 'viewer' }, error: null },
      ];

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`);
      const response = await listWebhooks(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/workspaces/:id/webhooks', () => {
    it('creates webhook and returns 201', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: TEST_WEBHOOK, error: null },
      ];

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`, {
        url: 'https://example.com/webhook',
        events: ['post.created'],
        secret: 'a-secret-that-is-long-enough',
      });
      const response = await createWebhook(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.url).toBe('https://example.com/webhook');
    });

    it('returns 400 on invalid URL', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
      ];

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`, {
        url: 'not-a-url',
        events: ['post.created'],
        secret: 'a-secret-that-is-long-enough',
      });
      const response = await createWebhook(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(400);
    });

    it('returns 400 on empty events array', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
      ];

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/webhooks`, {
        url: 'https://example.com/webhook',
        events: [],
        secret: 'a-secret-that-is-long-enough',
      });
      const response = await createWebhook(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/workspaces/:id/webhooks/:webhookId', () => {
    it('deletes webhook', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: { id: TEST_WEBHOOK.id }, error: null },
        { data: null, error: null },
      ];

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/webhooks/${TEST_WEBHOOK.id}`,
      );
      const response = await deleteWebhook(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, webhookId: TEST_WEBHOOK.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.deleted).toBe(true);
    });

    it('returns 404 for non-existent webhook', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: null, error: { code: 'PGRST116' } },
      ];

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/webhooks/non-existent`,
      );
      const response = await deleteWebhook(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, webhookId: 'non-existent' }),
      );

      expect(response.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      mockTableResponses = [
        { data: { role: 'member' }, error: null },
      ];

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/webhooks/${TEST_WEBHOOK.id}`,
      );
      const response = await deleteWebhook(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, webhookId: TEST_WEBHOOK.id }),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/workspaces/:id/webhooks/:webhookId/deliveries', () => {
    it('lists deliveries for webhook', async () => {
      const deliveries = [
        {
          id: 'd1',
          webhook_id: TEST_WEBHOOK.id,
          event_type: 'post.created',
          payload: {},
          status: 'delivered',
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
          response_status: 200,
          created_at: new Date().toISOString(),
        },
      ];

      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: { id: TEST_WEBHOOK.id }, error: null },
        { data: deliveries, error: null },
      ];

      const request = createTestRequest(
        'GET',
        `/api/workspaces/${TEST_WORKSPACE.id}/webhooks/${TEST_WEBHOOK.id}/deliveries`,
      );
      const response = await listDeliveries(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, webhookId: TEST_WEBHOOK.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('delivered');
    });

    it('returns 404 for non-existent webhook', async () => {
      mockTableResponses = [
        { data: { role: 'admin' }, error: null },
        { data: null, error: { code: 'PGRST116' } },
      ];

      const request = createTestRequest(
        'GET',
        `/api/workspaces/${TEST_WORKSPACE.id}/webhooks/non-existent/deliveries`,
      );
      const response = await listDeliveries(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, webhookId: 'non-existent' }),
      );

      expect(response.status).toBe(404);
    });
  });
});
