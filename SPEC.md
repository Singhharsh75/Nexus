# NEXUS — Project Specification

> This spec is the source of truth for building Nexus. Each phase is self-contained.
> Start a FRESH Claude Code session for each phase. Reference this file at session start.

---

## PHASE 0: Project Scaffold + Database Schema
**Goal:** Bootable Next.js project with Supabase connected, all tables created, RLS policies in place.
**Estimated scope:** ~2 hours

### 0.1 — Initialize Project
- `pnpm create next-app@latest nexus --typescript --tailwind --app --src-dir --eslint`
- Add dependencies:
  ```
  @supabase/ssr @supabase/supabase-js
  bullmq ioredis
  pino pino-pretty
  zod
  openai (for OpenRouter — uses OpenAI-compatible API)
  swagger-jsdoc swagger-ui-react
  uuid
  ```
- Dev dependencies:
  ```
  vitest @vitejs/plugin-react supertest
  @playwright/test
  @sentry/nextjs
  @types/uuid
  ```
- Add Shadcn/UI: `pnpm dlx shadcn-ui@latest init`
- Configure TypeScript strict mode in tsconfig.json
- Create `.env.local.example` with all required env vars (documented, no real values)
- Create `env.ts` using Zod to validate all env vars at startup

### 0.2 — Supabase Schema (SQL Migrations)
Create sequential migration files in `supabase/migrations/`:

**Migration 001 — Extensions:**
```sql
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**Migration 002 — Workspaces:**
```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 003 — Workspace Members:**
```sql
CREATE TYPE workspace_role AS ENUM ('admin', 'member', 'viewer');

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
```

**Migration 004 — Posts:**
```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT,
  content TEXT NOT NULL,
  embedding_status TEXT DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 005 — Post Chunks (for RAG):**
```sql
CREATE TABLE post_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_chunks_embedding ON post_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Migration 006 — Query History:**
```sql
CREATE TABLE query_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  query_text TEXT NOT NULL,
  answer_text TEXT,
  sources JSONB DEFAULT '[]',
  cached BOOLEAN DEFAULT FALSE,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 007 — Webhooks:**
```sql
CREATE TABLE workspace_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES workspace_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 008 — Refresh Tokens:**
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
```

**Migration 009 — RLS Policies:**
Apply RLS to EVERY table. Key policies:
- `workspaces`: users can only see workspaces they're members of
- `workspace_members`: users can see members of their own workspaces; only admins can insert/update/delete
- `posts`: members and admins can create; viewers can read; only author or admin can delete
- `post_chunks`: same read policy as posts (workspace membership); write only via service role (worker)
- `query_history`: users see only their own queries
- `workspace_webhooks`: only workspace admins can CRUD
- `webhook_deliveries`: only workspace admins can read
- `refresh_tokens`: users see only their own tokens

### 0.3 — Supabase Client Helpers
Create three client files in `src/lib/supabase/`:
- `client.ts` — browser client (for client components)
- `server.ts` — server client (for server components + API routes, uses cookies)
- `admin.ts` — service role client (for BullMQ worker, bypasses RLS)

### 0.4 — Logger Setup
Create `src/lib/logger/index.ts`:
- Pino instance with JSON formatting in production, pino-pretty in dev
- Default fields: `env`, `service` ("api" or "worker")
- Export `createRequestLogger(req)` that adds correlationId, userId, method, path
- Generate correlationId from `X-Request-ID` header or new UUID

### 0.5 — Docker Compose (Local Dev)
```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  # Supabase runs via `supabase start` (Supabase CLI) — not in Docker Compose
  # Worker runs via `pnpm worker:dev`
```

### Verification
- [ ] `pnpm dev` starts without errors
- [ ] `supabase start` connects and migrations apply
- [ ] All tables visible in Supabase Studio
- [ ] RLS policies block unauthorized reads in SQL editor
- [ ] Logger outputs structured JSON with correlationId
- [ ] Env validation throws clear error if any var is missing

---

## PHASE 1: Authentication System
**Goal:** Complete auth flow with JWT refresh token rotation, Supabase Auth integration, RBAC middleware.
**Estimated scope:** ~3 hours

### 1.1 — Supabase Auth Integration
- Signup/login pages using Supabase Auth (email + password)
- OAuth callback route at `/api/auth/callback`
- Session management via `@supabase/ssr` middleware in `middleware.ts`

### 1.2 — JWT Refresh Token Rotation
- On login: generate a refresh token, hash it (SHA-256), store in `refresh_tokens` table with a `family_id`
- On refresh: validate the presented token hash against DB → issue new access + refresh token → mark old token as revoked → store new token with same `family_id`
- Rotation detection: if a revoked token is presented, revoke the ENTIRE family (all tokens with that `family_id`) — this is replay attack protection
- Access token: short-lived (15 min), stored in httpOnly cookie
- Refresh token: longer-lived (7 days), stored in httpOnly cookie with stricter path

### 1.3 — RBAC Middleware
Create `src/lib/auth/rbac.ts`:
```typescript
type Permission = 'workspace:read' | 'workspace:write' | 'workspace:admin' | 'post:create' | 'post:delete' | 'query:create' | 'webhook:manage';

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  admin: ['workspace:read', 'workspace:write', 'workspace:admin', 'post:create', 'post:delete', 'query:create', 'webhook:manage'],
  member: ['workspace:read', 'post:create', 'post:delete', 'query:create'],  // post:delete only own posts
  viewer: ['workspace:read', 'query:create'],
};
```
- `withAuth(handler)` — verifies access token, attaches user to request context
- `withRole(handler, requiredPermission)` — checks user's role in the target workspace against permission map
- Both middlewares add correlationId and userId to the Pino logger for the request

### 1.4 — Rate Limiting
Create `src/lib/auth/rate-limit.ts`:
- Sliding window rate limiter using Redis ZSET
- Key: `ratelimit:{userId}:{endpoint}`
- Default: 20 AI queries / user / hour; 100 API calls / user / minute
- Return `429 Too Many Requests` with `Retry-After` header

### Verification
- [ ] User can sign up, log in, and access dashboard
- [ ] Refresh token rotation works — old token is revoked after use
- [ ] Replay detection: using a revoked token kills the entire family
- [ ] RBAC blocks viewer from creating posts, member from managing webhooks
- [ ] Rate limiter returns 429 after threshold
- [ ] Integration tests pass for full auth lifecycle (signup → login → refresh → logout)

---

## PHASE 2: Workspace + Posts CRUD
**Goal:** Users can create workspaces, invite members, assign roles, and create/read/delete posts.
**Estimated scope:** ~3 hours

### 2.1 — Workspace API Routes
- `POST /api/workspaces` — create workspace (creator becomes admin)
- `GET /api/workspaces` — list user's workspaces
- `GET /api/workspaces/[id]` — get workspace details (members, stats)
- `PATCH /api/workspaces/[id]` — update name/slug (admin only)
- `DELETE /api/workspaces/[id]` — delete workspace (admin only)

### 2.2 — Member Management
- `POST /api/workspaces/[id]/members` — invite member by email (admin only)
- `PATCH /api/workspaces/[id]/members/[userId]` — change role (admin only)
- `DELETE /api/workspaces/[id]/members/[userId]` — remove member (admin only)
- Admins cannot remove themselves if they're the last admin

### 2.3 — Posts API Routes
- `POST /api/workspaces/[id]/posts` — create post (member+ role)
- `GET /api/workspaces/[id]/posts` — list posts with pagination (cursor-based)
- `GET /api/workspaces/[id]/posts/[postId]` — get single post
- `DELETE /api/workspaces/[id]/posts/[postId]` — delete (author or admin only)
- On post creation: enqueue `embed-post` job to BullMQ

### 2.4 — Frontend Pages
- `/dashboard` — workspace selector
- `/workspace/[slug]` — main workspace view with post feed
- `/workspace/[slug]/settings` — workspace settings, member management (admin only)
- `/workspace/[slug]/webhooks` — webhook management (admin only)
- All pages use Shadcn/UI components, responsive layout

### Verification
- [ ] Full CRUD works through the UI
- [ ] RLS enforces workspace isolation (user A cannot see user B's workspace)
- [ ] Role changes propagate immediately
- [ ] Cursor-based pagination works correctly
- [ ] Integration tests cover CRUD + RBAC enforcement

---

## PHASE 3: Real-Time Layer
**Goal:** Live feed updates when posts are created/deleted, and presence showing active members.
**Estimated scope:** ~2 hours

### 3.1 — Supabase Realtime: Postgres Changes
- Subscribe to `posts` table changes filtered by `workspace_id`
- On INSERT: prepend new post to feed without page reload
- On DELETE: remove post from feed without page reload
- Use the Supabase Realtime client with proper channel management (subscribe on mount, unsubscribe on unmount)

### 3.2 — Presence
- Track which users are currently viewing a workspace
- Show active member avatars/indicators in the workspace header
- Use Supabase Realtime Presence (track/untrack on join/leave)
- Custom hook: `usePresence(workspaceId)` returning `{ onlineUsers: User[] }`

### 3.3 — Custom Hooks
- `useRealtimePosts(workspaceId)` — manages subscription + state
- `usePresence(workspaceId)` — manages presence tracking
- Both hooks handle cleanup on unmount and workspace switch

### Verification
- [ ] Open two browser tabs in same workspace — post in one, appears in the other instantly
- [ ] Presence indicators show both tabs as active users
- [ ] Closing a tab removes the user from presence within a few seconds
- [ ] Switching workspaces properly cleans up old subscriptions
- [ ] Playwright E2E: two browser contexts, post in one, assert visible in other

---

## PHASE 4: AI / RAG Pipeline
**Goal:** Posts are auto-embedded via BullMQ workers. Users can query workspace knowledge and get streamed, cited answers.
**Estimated scope:** ~4 hours (most complex phase)

### 4.1 — BullMQ Worker Setup
Create standalone worker process in `worker/`:
- Connects to Redis (same instance as cache)
- Processes queues: `embed-post`, `reindex-workspace`, `webhook-deliver`
- Uses Supabase admin client (service role — bypasses RLS)
- Logs via Pino with `service: "worker"` and includes job ID in every log line

### 4.2 — Embedding Pipeline (`embed-post` job)
1. Receive job: `{ postId, workspaceId }`
2. Fetch post content from DB
3. Chunk the content:
   - Split by paragraphs first
   - If paragraph > 500 tokens, split by sentences
   - Each chunk: 200-500 tokens with 50-token overlap
   - Include metadata: `{ postId, chunkIndex, authorId, createdAt }`
4. Generate embeddings via OpenRouter:
   - Model: `nomic-ai/nomic-embed-text-v1.5`
   - Use OpenAI-compatible endpoint: `https://openrouter.ai/api/v1`
   - Batch chunks (max 20 per request)
5. Upsert chunks + embeddings into `post_chunks` table
6. Update `posts.embedding_status` to 'completed' (or 'failed' with error)
7. Log: postId, chunk count, total embedding time, tokens used

### 4.3 — Semantic Cache
Create `src/lib/ai/semantic-cache.ts`:
- On query: generate embedding for the query text
- Search Redis for cached embeddings within cosine distance < 0.05
  - Implementation: store query embeddings as Redis keys with TTL
  - For simplicity: hash the query text (normalized, lowercase, trimmed) as cache key
  - Store: `{ answer, sources, createdAt }`
  - TTL: 1 hour
- Cache hit: return cached answer (mark `cached: true` in query_history)
- Cache miss: proceed to RAG pipeline

### 4.4 — RAG Query Pipeline
Create `src/lib/ai/rag-pipeline.ts`:
1. **Embed query:** Generate embedding for user's question (same model as posts)
2. **Retrieve:** pgvector similarity search on `post_chunks` filtered by `workspace_id`
   ```sql
   SELECT pc.*, p.title, p.author_id
   FROM post_chunks pc
   JOIN posts p ON pc.post_id = p.id
   WHERE pc.workspace_id = $1
   ORDER BY pc.embedding <=> $2
   LIMIT 10;
   ```
3. **Rerank (simple):** Filter chunks below similarity threshold (0.3)
4. **Generate:** Call OpenRouter chat completion with:
   - System prompt instructing citation format: `[Source: {post_title}]`
   - User question
   - Retrieved chunks as context
   - Instruction: "Only answer based on the provided context. If the context doesn't contain the answer, say so."
5. **Stream:** Return response via SSE (`text/event-stream`)
6. **Log:** Record in `query_history` with latency, sources, cached status

### 4.5 — Query API Route
`POST /api/workspaces/[id]/query`:
- Requires `query:create` permission (viewer+ role)
- Rate limited (20/hour per user)
- Request body: `{ query: string }`
- Response: SSE stream with events:
  - `sources` event: list of source posts used
  - `delta` events: streamed answer chunks
  - `done` event: final metadata (latency, cached)
- Add correlationId to all logs throughout the pipeline

### 4.6 — Query UI
- Chat-style interface at bottom of workspace page
- Input field with send button
- Streamed answer appears token-by-token
- Source citations shown as clickable chips linking to original posts
- Loading state while embedding/retrieving
- Cache indicator (small badge if answer was cached)

### Verification
- [ ] Create a post → embedding_status changes to 'completed' within seconds
- [ ] post_chunks table has entries with valid embeddings
- [ ] Query about post content returns relevant, cited answer
- [ ] Answer streams token-by-token (not all at once)
- [ ] Second identical query returns cached result (faster, marked as cached)
- [ ] Query about unrelated topic returns "not enough context" response
- [ ] Rate limiter kicks in after 20 queries/hour
- [ ] Worker logs show job processing with timing metrics

---

## PHASE 5: Webhooks System
**Goal:** Workspace admins can register webhook URLs and receive async notifications on key events.
**Estimated scope:** ~2 hours

### 5.1 — Webhook Registration API
- `POST /api/workspaces/[id]/webhooks` — register webhook (admin only)
  - Body: `{ url: string, events: ('post.created' | 'member.joined' | 'query.completed')[], secret: string }`
- `GET /api/workspaces/[id]/webhooks` — list webhooks (admin only)
- `DELETE /api/workspaces/[id]/webhooks/[webhookId]` — remove webhook (admin only)
- `GET /api/workspaces/[id]/webhooks/[webhookId]/deliveries` — delivery log (admin only)

### 5.2 — Webhook Dispatch
- When events fire (post created, member joined, query completed), enqueue `webhook-deliver` job
- Job payload: `{ webhookId, eventType, data }`
- Worker:
  1. Fetch webhook config from DB
  2. Build payload with HMAC-SHA256 signature using webhook secret
  3. POST to webhook URL with headers: `X-Nexus-Event`, `X-Nexus-Signature`, `X-Nexus-Delivery-ID`
  4. Record delivery status in `webhook_deliveries`
  5. On failure: retry 3x with exponential backoff (1s → 4s → 16s)
  6. After 3 failures: mark delivery as 'failed'

### Verification
- [ ] Admin can register a webhook via UI
- [ ] Creating a post triggers webhook delivery to registered URL
- [ ] Delivery log shows status, attempts, response codes
- [ ] Failed deliveries retry with exponential backoff
- [ ] Non-admins cannot access webhook management

---

## PHASE 6: Observability + Health Checks
**Goal:** Production-grade logging, error tracking, health monitoring, and correlation tracing.
**Estimated scope:** ~2 hours

### 6.1 — Sentry Integration
- Install `@sentry/nextjs` and run setup wizard
- Configure for both client and server
- Capture unhandled errors + custom error boundaries
- Add user context (userId, workspaceId) to Sentry scope

### 6.2 — Health Check Endpoint
`GET /api/health` — returns:
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": {
    "database": { "status": "up", "latency_ms": 12 },
    "redis": { "status": "up", "latency_ms": 3 },
    "worker": { "status": "up", "last_heartbeat": "2026-06-21T..." }
  },
  "version": "1.0.0",
  "uptime_seconds": 3600
}
```
- DB check: `SELECT 1` query with timeout
- Redis check: `PING` command
- Worker check: worker writes heartbeat to Redis key every 30s; API checks recency

### 6.3 — Correlation ID Tracing
- API middleware generates UUID per request (or uses `X-Request-ID` header)
- Correlation ID attached to:
  - All Pino log entries for that request
  - BullMQ job data (so worker logs can trace back to originating request)
  - Sentry breadcrumbs
  - Response header `X-Request-ID`

### 6.4 — Request Logging Middleware
Every API request logs:
- `method`, `path`, `statusCode`, `duration_ms`
- `userId`, `workspaceId` (if authenticated)
- `correlationId`
- On error: full error with stack trace

### Verification
- [ ] Health endpoint returns correct status for all services
- [ ] Kill Redis → health shows redis as "down", overall status "degraded"
- [ ] Trigger an error → appears in Sentry with userId and correlationId
- [ ] Search logs by correlationId → find API request + corresponding worker job logs
- [ ] Every API response has `X-Request-ID` header

---

## PHASE 7: Testing Suite
**Goal:** Comprehensive test coverage — unit, integration, E2E.
**Estimated scope:** ~3 hours

### 7.1 — Integration Tests (Vitest + Supertest)
Test files in `tests/integration/`:
- `auth.test.ts` — signup, login, refresh rotation, replay detection, logout
- `workspaces.test.ts` — CRUD, member management, RBAC enforcement
- `posts.test.ts` — CRUD, pagination, RLS isolation
- `query.test.ts` — RAG pipeline, cache hit/miss, rate limiting
- `webhooks.test.ts` — registration, delivery, retry logic
- `health.test.ts` — healthy/degraded/unhealthy states

Each test file:
- Sets up test user(s) and workspace via Supabase admin client
- Cleans up after itself
- Tests both happy path AND unauthorized access

### 7.2 — E2E Tests (Playwright)
Test files in `tests/e2e/`:
- `auth-flow.spec.ts` — signup → login → dashboard → logout
- `workspace-flow.spec.ts` — create workspace → invite member → assign roles
- `post-and-query.spec.ts` — create post → wait for embedding → query → verify cited answer
- `realtime.spec.ts` — two browser contexts, post in one, assert appears in other
- `rbac.spec.ts` — viewer cannot create post, member cannot manage webhooks

### 7.3 — Test Utilities
- `tests/helpers/setup.ts` — create test users, workspaces, seed posts
- `tests/helpers/teardown.ts` — clean up test data
- `tests/helpers/wait-for-embedding.ts` — poll post embedding_status until 'completed'

### Verification
- [ ] `pnpm test` runs all integration tests and passes
- [ ] `pnpm test:e2e` runs all Playwright tests and passes
- [ ] Tests run in CI (GitHub Actions) with Supabase + Redis services

---

## PHASE 8: CI/CD + Deployment
**Goal:** Automated pipeline, production deployment, API docs.
**Estimated scope:** ~2 hours

### 8.1 — GitHub Actions CI
`.github/workflows/ci.yml`:
- Trigger: push to main, all PRs
- Jobs:
  1. `lint-and-typecheck`: ESLint + tsc --noEmit
  2. `test-integration`: Vitest with Supabase + Redis services
  3. `test-e2e`: Playwright with full app running
  4. `docker-build`: verify Docker Compose builds successfully

### 8.2 — Deployment
- **Vercel:** Connect GitHub repo, auto-deploy on push to main
- **Supabase Cloud:** Create project, apply migrations, configure RLS
- **Upstash:** Create Redis instance, configure BullMQ connection
- **Sentry:** Create project, add DSN to env vars
- **Environment variables:** All configured via Vercel dashboard

### 8.3 — API Documentation
- Configure `swagger-jsdoc` to read JSDoc comments from API routes
- Serve Swagger UI at `/api/docs`
- Document: all endpoints, request/response schemas, auth requirements, error codes

### 8.4 — Load Testing (k6)
Create `tests/load/` directory:
- `query-load.js` — simulate 50 concurrent users sending AI queries
- `websocket-load.js` — simulate 100 concurrent WebSocket connections
- `api-load.js` — simulate 200 req/s to CRUD endpoints
- Document results in `docs/load-testing.md` with p50, p95, p99 latencies

### Verification
- [ ] Push to GitHub → CI runs all checks → green
- [ ] Live URL accessible and functional
- [ ] `/api/docs` shows Swagger UI with all endpoints
- [ ] `/api/health` returns healthy on production
- [ ] Load test results documented with real numbers

---

## OUT OF SCOPE (Explicitly)
- Email notifications (no email service)
- File/image uploads in posts (text only)
- Full-text search (pgvector similarity search only)
- Mobile app
- Payment/billing
- Admin dashboard for platform-level management
- SSO / OAuth providers beyond email+password
