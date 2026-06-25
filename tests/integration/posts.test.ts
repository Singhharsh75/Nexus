import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearTestCookies, getTestCookieStore } from '../helpers/vitest-setup';
import {
  createTestRequest,
  createRouteContext,
  setAuthenticatedCookies,
  TEST_USER,
  TEST_USER_2,
  TEST_WORKSPACE,
} from '../helpers/setup';

function buildChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains',
    'order', 'limit', 'range', 'is', 'not', 'match', 'filter', 'or',
  ];
  for (const m of methods) chain[m] = vi.fn(self);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  if (result.count !== undefined) (chain as Record<string, unknown>).count = result.count;
  return chain;
}

let mockTableData: Record<string, { data: unknown; error: unknown; count?: number | null }> = {};

const mockSupabase = {
  from: vi.fn().mockImplementation((table: string) => {
    const result = mockTableData[table] ?? { data: null, error: null };
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

const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
vi.mock('@/lib/queue', () => ({
  getEmbedPostQueue: vi.fn(() => ({ add: mockQueueAdd })),
  getWebhookDeliverQueue: vi.fn(() => ({ add: vi.fn(), addBulk: vi.fn() })),
}));

vi.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

import { GET as listPosts, POST as createPost } from '@/app/api/workspaces/[id]/posts/route';
import { GET as getPost, DELETE as deletePost } from '@/app/api/workspaces/[id]/posts/[postId]/route';

const TEST_POST = {
  id: '00000000-0000-0000-0000-000000000020',
  workspace_id: TEST_WORKSPACE.id,
  author_id: TEST_USER.id,
  title: 'Test Post',
  content: 'Test content for the post',
  embedding_status: 'pending',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Posts CRUD', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearTestCookies();
    mockTableData = {};
    mockSupabase.from.mockImplementation((table: string) => {
      const result = mockTableData[table] ?? { data: null, error: null };
      return buildChain(result);
    });
    await setAuthenticatedCookies(getTestCookieStore());
    mockTableData['workspace_members'] = { data: { role: 'admin' }, error: null };
  });

  describe('GET /api/workspaces/:id/posts', () => {
    it('returns paginated posts', async () => {
      const posts = Array.from({ length: 3 }, (_, i) => ({
        ...TEST_POST,
        id: `post-${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      }));

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'admin' }, error: null });
        }
        if (table === 'posts') {
          callCount++;
          const chain = buildChain({ data: posts, error: null });
          chain.then = vi.fn((resolve: (v: unknown) => void) =>
            resolve({ data: posts, error: null }),
          );
          return chain;
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/posts?limit=20`);
      const response = await listPosts(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body).toHaveProperty('has_more');
      expect(body).toHaveProperty('next_cursor');
    });

    it('returns 403 for non-member', async () => {
      mockTableData['workspace_members'] = {
        data: null,
        error: { code: 'PGRST116' },
      };

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/posts`);
      const response = await listPosts(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/workspaces/:id/posts', () => {
    it('creates post and enqueues embed job', async () => {
      let postCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'member' }, error: null });
        }
        if (table === 'posts') {
          postCallCount++;
          return buildChain({ data: TEST_POST, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/posts`, {
        title: 'Test Post',
        content: 'Test content for the post',
      });
      const response = await createPost(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.id).toBe(TEST_POST.id);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'embed-post',
        expect.objectContaining({
          postId: TEST_POST.id,
          workspaceId: TEST_WORKSPACE.id,
        }),
        expect.any(Object),
      );
    });

    it('returns 400 on empty content', async () => {
      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/posts`, {
        title: 'No Content',
      });
      const response = await createPost(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(400);
    });

    it('returns 403 for viewer (needs post:create)', async () => {
      mockTableData['workspace_members'] = { data: { role: 'viewer' }, error: null };

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/posts`, {
        content: 'Hello',
      });
      const response = await createPost(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/workspaces/:id/posts/:postId', () => {
    it('returns post by ID', async () => {
      let getCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'member' }, error: null });
        }
        if (table === 'posts') {
          getCallCount++;
          return buildChain({ data: TEST_POST, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'GET',
        `/api/workspaces/${TEST_WORKSPACE.id}/posts/${TEST_POST.id}`,
      );
      const response = await getPost(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, postId: TEST_POST.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.id).toBe(TEST_POST.id);
    });

    it('returns 404 for non-existent post', async () => {
      let notFoundCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'member' }, error: null });
        }
        if (table === 'posts') {
          notFoundCount++;
          return buildChain({ data: null, error: { code: 'PGRST116' } });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'GET',
        `/api/workspaces/${TEST_WORKSPACE.id}/posts/non-existent`,
      );
      const response = await getPost(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, postId: 'non-existent' }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/workspaces/:id/posts/:postId', () => {
    it('allows author to delete own post', async () => {
      let delCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'member' }, error: null });
        }
        if (table === 'posts') {
          delCount++;
          if (delCount === 1) {
            return buildChain({ data: { id: TEST_POST.id, author_id: TEST_USER.id }, error: null });
          }
          return buildChain({ data: null, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/posts/${TEST_POST.id}`,
      );
      const response = await deletePost(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, postId: TEST_POST.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.message).toBe('Post deleted');
    });

    it('allows admin to delete any post', async () => {
      let adminDelCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'admin' }, error: null });
        }
        if (table === 'posts') {
          adminDelCount++;
          if (adminDelCount === 1) {
            return buildChain({ data: { id: TEST_POST.id, author_id: TEST_USER_2.id }, error: null });
          }
          return buildChain({ data: null, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/posts/${TEST_POST.id}`,
      );
      const response = await deletePost(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, postId: TEST_POST.id }),
      );

      expect(response.status).toBe(200);
    });

    it('returns 403 for non-author member', async () => {
      let forbidCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return buildChain({ data: { role: 'member' }, error: null });
        }
        if (table === 'posts') {
          forbidCount++;
          return buildChain({ data: { id: TEST_POST.id, author_id: TEST_USER_2.id }, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/posts/${TEST_POST.id}`,
      );
      const response = await deletePost(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, postId: TEST_POST.id }),
      );

      expect(response.status).toBe(403);
    });
  });
});
