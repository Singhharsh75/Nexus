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

let mockTableData: Record<string, { data: unknown; error: unknown; count?: number | null }> = {};

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
  if (result.count !== undefined) {
    (chain as Record<string, unknown>).count = result.count;
  }
  return chain;
}

const mockSupabase = {
  from: vi.fn().mockImplementation((table: string) => {
    const result = mockTableData[table] ?? { data: null, error: null };
    return buildChain(result);
  }),
  rpc: vi.fn().mockResolvedValue({ data: [{ id: TEST_USER_2.id }], error: null }),
  auth: {
    admin: {
      getUserById: vi.fn().mockResolvedValue({
        data: { user: { id: TEST_USER.id, email: TEST_USER.email } },
        error: null,
      }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
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

vi.mock('@/lib/queue', () => ({
  getEmbedPostQueue: vi.fn(() => ({ add: vi.fn().mockResolvedValue({ id: 'job-1' }) })),
  getWebhookDeliverQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    addBulk: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST as createWorkspace, GET as listWorkspaces } from '@/app/api/workspaces/route';
import { GET as getWorkspace, PATCH as updateWorkspace, DELETE as deleteWorkspace } from '@/app/api/workspaces/[id]/route';
import { GET as listMembers, POST as inviteMember } from '@/app/api/workspaces/[id]/members/route';
import { PATCH as updateMemberRole, DELETE as removeMember } from '@/app/api/workspaces/[id]/members/[userId]/route';

describe('Workspace CRUD', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearTestCookies();
    mockTableData = {};
    await setAuthenticatedCookies(getTestCookieStore());

    mockTableData['workspace_members'] = {
      data: { role: 'admin' },
      error: null,
    };
  });

  describe('POST /api/workspaces', () => {
    it('creates workspace and returns 201', async () => {
      mockTableData['workspaces'] = { data: TEST_WORKSPACE, error: null };

      const request = createTestRequest('POST', '/api/workspaces', {
        name: 'Test Workspace',
        slug: 'test-workspace',
      });

      const response = await createWorkspace(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.name).toBe('Test Workspace');
      expect(body.slug).toBe('test-workspace');
    });

    it('returns 409 on duplicate slug', async () => {
      mockTableData['workspaces'] = {
        data: null,
        error: { code: '23505', message: 'unique violation' },
      };

      const request = createTestRequest('POST', '/api/workspaces', {
        name: 'Dup',
        slug: 'existing-slug',
      });

      const response = await createWorkspace(request);
      expect(response.status).toBe(409);
    });

    it('returns 401 when not authenticated', async () => {
      clearTestCookies();

      const request = createTestRequest('POST', '/api/workspaces', {
        name: 'X',
        slug: 'x',
      });

      const response = await createWorkspace(request);
      expect(response.status).toBe(401);
    });

    it('returns 400 on invalid body', async () => {
      const request = createTestRequest('POST', '/api/workspaces', {});

      const response = await createWorkspace(request);
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/workspaces', () => {
    it('lists workspaces for authenticated user', async () => {
      mockTableData['workspace_members'] = {
        data: [
          {
            workspace_id: TEST_WORKSPACE.id,
            role: 'admin',
            workspaces: TEST_WORKSPACE,
          },
        ],
        error: null,
      };

      const request = createTestRequest('GET', '/api/workspaces');
      const response = await listWorkspaces(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('returns workspace details for member', async () => {
      mockTableData['workspaces'] = { data: TEST_WORKSPACE, error: null };
      mockTableData['workspace_members'] = { data: { role: 'admin' }, error: null };
      mockTableData['posts'] = { data: null, error: null, count: 5 };

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}`);
      const response = await getWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.id).toBe(TEST_WORKSPACE.id);
    });

    it('returns 403 for non-member', async () => {
      mockTableData['workspace_members'] = {
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      };

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}`);
      const response = await getWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/workspaces/:id', () => {
    it('updates workspace for admin', async () => {
      mockTableData['workspaces'] = {
        data: { ...TEST_WORKSPACE, name: 'Updated' },
        error: null,
      };

      const request = createTestRequest('PATCH', `/api/workspaces/${TEST_WORKSPACE.id}`, {
        name: 'Updated',
      });
      const response = await updateWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(200);
    });

    it('returns 403 for member (needs workspace:admin)', async () => {
      mockTableData['workspace_members'] = { data: { role: 'member' }, error: null };

      const request = createTestRequest('PATCH', `/api/workspaces/${TEST_WORKSPACE.id}`, {
        name: 'Updated',
      });
      const response = await updateWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });

    it('returns 400 when no fields to update', async () => {
      const request = createTestRequest('PATCH', `/api/workspaces/${TEST_WORKSPACE.id}`, {});
      const response = await updateWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('deletes workspace for admin', async () => {
      mockTableData['workspaces'] = { data: null, error: null };

      const request = createTestRequest('DELETE', `/api/workspaces/${TEST_WORKSPACE.id}`);
      const response = await deleteWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.message).toBe('Workspace deleted');
    });

    it('returns 403 for non-admin', async () => {
      mockTableData['workspace_members'] = { data: { role: 'viewer' }, error: null };

      const request = createTestRequest('DELETE', `/api/workspaces/${TEST_WORKSPACE.id}`);
      const response = await deleteWorkspace(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });
});

describe('Member management', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearTestCookies();
    mockTableData = {};
    await setAuthenticatedCookies(getTestCookieStore());
    mockTableData['workspace_members'] = { data: { role: 'admin' }, error: null };
  });

  describe('GET /api/workspaces/:id/members', () => {
    it('lists members for workspace member', async () => {
      let membersCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          membersCallCount++;
          if (membersCallCount === 1) {
            return buildChain({ data: { role: 'admin' }, error: null });
          }
          const membersData = [
            { id: 'm1', user_id: TEST_USER.id, role: 'admin', joined_at: new Date().toISOString() },
          ];
          const chain = buildChain({ data: membersData, error: null });
          chain.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: membersData, error: null }));
          return chain;
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest('GET', `/api/workspaces/${TEST_WORKSPACE.id}/members`);
      const response = await listMembers(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/workspaces/:id/members', () => {
    it('invites member by email', async () => {
      const inviteResult = {
        data: { id: 'member-new', workspace_id: TEST_WORKSPACE.id, user_id: TEST_USER_2.id, role: 'member' },
        error: null,
      };

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          callCount++;
          if (callCount <= 1) {
            return buildChain({ data: { role: 'admin' }, error: null });
          }
          if (callCount === 2) {
            return buildChain({ data: null, error: { code: 'PGRST116' } });
          }
          return buildChain(inviteResult);
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/members`, {
        email: TEST_USER_2.email,
        role: 'member',
      });
      const response = await inviteMember(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(201);
    });

    it('returns 403 for non-admin', async () => {
      mockTableData['workspace_members'] = { data: { role: 'member' }, error: null };

      const request = createTestRequest('POST', `/api/workspaces/${TEST_WORKSPACE.id}/members`, {
        email: TEST_USER_2.email,
        role: 'member',
      });
      const response = await inviteMember(request, createRouteContext({ id: TEST_WORKSPACE.id }));

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/workspaces/:id/members/:userId', () => {
    it('updates member role', async () => {
      let patchCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          patchCallCount++;
          if (patchCallCount === 1) {
            return buildChain({ data: { role: 'admin' }, error: null });
          }
          if (patchCallCount === 2) {
            return buildChain({ data: { id: 'm2', role: 'member' }, error: null });
          }
          return buildChain({ data: null, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'PATCH',
        `/api/workspaces/${TEST_WORKSPACE.id}/members/${TEST_USER_2.id}`,
        { role: 'viewer' },
      );
      const response = await updateMemberRole(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, userId: TEST_USER_2.id }),
      );

      expect(response.status).toBe(200);
    });

    it('returns 403 for non-admin', async () => {
      mockTableData['workspace_members'] = { data: { role: 'member' }, error: null };

      const request = createTestRequest(
        'PATCH',
        `/api/workspaces/${TEST_WORKSPACE.id}/members/${TEST_USER_2.id}`,
        { role: 'viewer' },
      );
      const response = await updateMemberRole(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, userId: TEST_USER_2.id }),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/workspaces/:id/members/:userId', () => {
    it('removes member', async () => {
      let delCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          delCallCount++;
          if (delCallCount === 1) {
            return buildChain({ data: { role: 'admin' }, error: null });
          }
          if (delCallCount === 2) {
            return buildChain({ data: { id: 'm2', role: 'member' }, error: null });
          }
          return buildChain({ data: null, error: null });
        }
        return buildChain({ data: null, error: null });
      });

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/members/${TEST_USER_2.id}`,
      );
      const response = await removeMember(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, userId: TEST_USER_2.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.message).toBe('Member removed');
    });

    it('returns 403 for non-admin', async () => {
      mockTableData['workspace_members'] = { data: { role: 'viewer' }, error: null };

      const request = createTestRequest(
        'DELETE',
        `/api/workspaces/${TEST_WORKSPACE.id}/members/${TEST_USER_2.id}`,
      );
      const response = await removeMember(
        request,
        createRouteContext({ id: TEST_WORKSPACE.id, userId: TEST_USER_2.id }),
      );

      expect(response.status).toBe(403);
    });
  });
});
