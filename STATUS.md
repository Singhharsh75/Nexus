# Phase 7: Testing Suite — Status

## Current Phase: 7 (Testing Suite)
## Status: COMPLETE

## Completed Sub-sections
- **7.0**: Test infrastructure & config ✅
  - `tests/helpers/__mocks__/server-only.ts` — empty module for server-only import
  - `tests/helpers/vitest-setup.ts` — env vars, next/headers mock, Sentry mock, cookie store
  - `tests/helpers/setup.ts` — test factories (createTestRequest, signTestAccessToken, setAuthenticatedCookies, mockSupabaseFrom, createRouteContext, mockRedisClient, mockQueue)
  - `tests/helpers/teardown.ts` — cleanupUser, cleanupWorkspace, cleanupAll
  - `vitest.config.ts` — node env, @ alias, server-only alias, setupFiles

- **7.1**: Integration tests ✅ (ALL 6 FILES, 65 TESTS PASSING)
  - `tests/integration/health.test.ts` — 7 tests (healthy, degraded, unhealthy, stale heartbeat, no heartbeat, version/uptime, X-Request-ID)
  - `tests/integration/auth.test.ts` — 11 tests (login success/401/400, refresh 401/replay, logout success/silent-error)
  - `tests/integration/workspaces.test.ts` — 19 tests (CRUD, member management, RBAC enforcement)
  - `tests/integration/posts.test.ts` — 10 tests (list pagination, create+embed job, get, delete by author/admin/non-author, viewer blocked)
  - `tests/integration/query.test.ts` — 7 tests (SSE stream, cached, rate limit 429, invalid, non-member 403, error handling)
  - `tests/integration/webhooks.test.ts` — 11 tests (list/create/delete, deliveries, RBAC for member/viewer)

- **7.2**: E2E infrastructure ✅
  - `playwright.config.ts` — Chromium project, auto-starts dev server locally, GitHub reporter in CI
  - `tests/helpers/wait-for-embedding.ts` — polls post embedding_status with configurable timeout/interval

- **7.3**: E2E tests ✅ (5 FILES, 24 TESTS)
  - `tests/e2e/auth-flow.spec.ts` — 7 tests (signup confirmation, password validation, invalid login, redirect, nav links)
  - `tests/e2e/workspace-flow.spec.ts` — 5 tests (create workspace, navigate, settings, members tab, delete)
  - `tests/e2e/post-and-query.spec.ts` — 5 tests (create post, embedding badge, query panel, streaming, delete)
  - `tests/e2e/realtime.spec.ts` — 2 tests (cross-tab post appearance, presence indicators)
  - `tests/e2e/rbac.spec.ts` — 5 tests (viewer blocked from post/settings/webhooks, admin access)

- **7.4**: CI pipeline ✅
  - `.github/workflows/ci.yml` — 4 jobs: lint-and-typecheck, test-integration (Redis service), test-e2e (Redis + Playwright), docker-build

## Modified Files (this phase)
- `vitest.config.ts`
- `playwright.config.ts`
- `tests/helpers/__mocks__/server-only.ts`
- `tests/helpers/vitest-setup.ts`
- `tests/helpers/setup.ts`
- `tests/helpers/teardown.ts`
- `tests/helpers/wait-for-embedding.ts`
- `tests/integration/health.test.ts`
- `tests/integration/auth.test.ts`
- `tests/integration/workspaces.test.ts`
- `tests/integration/posts.test.ts`
- `tests/integration/query.test.ts`
- `tests/integration/webhooks.test.ts`
- `tests/e2e/auth-flow.spec.ts`
- `tests/e2e/workspace-flow.spec.ts`
- `tests/e2e/post-and-query.spec.ts`
- `tests/e2e/realtime.spec.ts`
- `tests/e2e/rbac.spec.ts`
- `.github/workflows/ci.yml`
- `package.json` (vite added as dev dependency by pnpm)

## Test Status
- `pnpm test` → 6 files, 65 tests, ALL PASSING
- `pnpm test:e2e` → 5 files, 24 tests (requires live Supabase + env vars)

## Known Issues
- None. All integration tests pass cleanly.
- E2E tests require `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_USER2_EMAIL`, `E2E_USER2_PASSWORD` env vars pointing to real Supabase users.

## CI Required Secrets
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_USER2_EMAIL`, `E2E_USER2_PASSWORD`

## Next Phase
- **Phase 8**: CI/CD + Deployment (8.1–8.4)
