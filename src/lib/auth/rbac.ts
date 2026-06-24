import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verifyAccessToken, type AccessTokenPayload } from './jwt';
import { getAccessToken } from './cookies';
import { getCorrelationId, createRequestLogger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

export type WorkspaceRole = 'admin' | 'member' | 'viewer';

export type Permission =
  | 'workspace:read'
  | 'workspace:write'
  | 'workspace:admin'
  | 'post:create'
  | 'post:delete'
  | 'query:create'
  | 'webhook:manage';

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  admin: [
    'workspace:read',
    'workspace:write',
    'workspace:admin',
    'post:create',
    'post:delete',
    'query:create',
    'webhook:manage',
  ],
  member: ['workspace:read', 'post:create', 'post:delete', 'query:create'],
  viewer: ['workspace:read', 'query:create'],
};

export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface AuthenticatedRequest {
  user: AccessTokenPayload;
  correlationId: string;
  params: Record<string, string>;
}

export interface AuthorizedRequest extends AuthenticatedRequest {
  workspaceId: string;
  role: WorkspaceRole;
}

type AuthHandler = (
  request: Request,
  context: AuthenticatedRequest,
) => Promise<NextResponse>;

type RoleHandler = (
  request: Request,
  context: AuthorizedRequest,
) => Promise<NextResponse>;

export function withAuth(handler: AuthHandler) {
  return async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) => {
    const start = Date.now();
    const correlationId = getCorrelationId(request.headers);
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const log = createRequestLogger(correlationId, { method, path });

    const token = await getAccessToken();
    if (!token) {
      const duration_ms = Date.now() - start;
      log.info({ statusCode: 401, duration_ms }, 'Request completed');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const payload = await verifyAccessToken(token);
    if (!payload || !payload.sub) {
      const duration_ms = Date.now() - start;
      log.info({ statusCode: 401, duration_ms }, 'Request completed');
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: { 'X-Request-ID': correlationId } },
      );
    }

    const params = routeContext?.params ? await routeContext.params : {};

    Sentry.setUser({ id: payload.sub });
    Sentry.setTag('correlationId', correlationId);
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Authenticated request',
      data: { correlationId },
      level: 'info',
    });

    log.info({ userId: payload.sub }, 'Authenticated request');

    try {
      const response = await handler(request, { user: payload, correlationId, params });
      const duration_ms = Date.now() - start;
      log.info(
        { userId: payload.sub, statusCode: response.status, duration_ms },
        'Request completed',
      );
      return response;
    } catch (error) {
      const duration_ms = Date.now() - start;
      log.error(
        { userId: payload.sub, duration_ms, error, stack: error instanceof Error ? error.stack : undefined },
        'Request failed with unhandled error',
      );
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: { 'X-Request-ID': correlationId } },
      );
    }
  };
}

export function withRole(
  handler: RoleHandler,
  requiredPermission: Permission,
) {
  return withAuth(async (request, authContext) => {
    const log = createRequestLogger(authContext.correlationId, {
      userId: authContext.user.sub,
    });

    const workspaceId = authContext.params.id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400, headers: { 'X-Request-ID': authContext.correlationId } },
      );
    }

    const supabase = createAdminClient();
    const { data: membership, error } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', authContext.user.sub)
      .single();

    if (error || !membership) {
      log.warn({ workspaceId }, 'Not a workspace member');
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403, headers: { 'X-Request-ID': authContext.correlationId } },
      );
    }

    const role = membership.role as WorkspaceRole;

    if (!hasPermission(role, requiredPermission)) {
      log.warn({ workspaceId, role, requiredPermission }, 'Insufficient permissions');
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: { 'X-Request-ID': authContext.correlationId } },
      );
    }

    Sentry.setTag('workspaceId', workspaceId);
    Sentry.addBreadcrumb({
      category: 'rbac',
      message: `Authorized as ${role}`,
      data: { workspaceId, correlationId: authContext.correlationId },
      level: 'info',
    });

    log.info({ workspaceId, role }, 'Authorized request');

    return handler(request, {
      ...authContext,
      workspaceId,
      role,
    });
  });
}
