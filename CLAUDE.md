# Nexus — AI-Enhanced Team Knowledge Hub

## What This Is
A real-time multi-user workspace where team posts are auto-embedded and indexed in pgvector, enabling natural-language queries that return streamed, citation-backed answers grounded in workspace content. Key differentiators: real-time collaboration via Supabase Realtime, three-tier RBAC, and production-grade observability.

## Tech Stack
- **Frontend:** Next.js 14 (App Router), TypeScript (strict), Tailwind CSS, Shadcn/UI
- **Backend:** Next.js API Routes + standalone BullMQ worker process
- **Database:** Supabase (PostgreSQL 15 + pgvector), Supabase Auth
- **Real-Time:** Supabase Realtime (Postgres Changes + Broadcast + Presence)
- **Queue:** BullMQ backed by Redis/Upstash
- **Cache:** Redis — semantic cache (LLM queries), rate limiting (sliding window)
- **AI/LLM:** OpenRouter API (GPT-4o, Claude, Llama), nomic-embed-text embeddings
- **Auth:** Custom JWT refresh token rotation, RBAC middleware (admin/member/viewer), Supabase RLS
- **Testing:** Vitest (unit/integration), Supertest (API), Playwright (E2E)
- **Observability:** Pino (structured JSON logging), Sentry (error tracking)
- **CI/CD:** GitHub Actions
- **Deployment:** Vercel (frontend) + Supabase Cloud (DB) + Upstash (Redis/Queue)
- **Docs:** Swagger/OpenAPI at /api/docs

## Project Structure
```
nexus/
├── src/
│   ├── app/                  # Next.js App Router pages + API routes
│   │   ├── (auth)/           # Auth pages (login, signup, callback)
│   │   ├── (dashboard)/      # Protected workspace pages
│   │   ├── api/
│   │   │   ├── auth/         # JWT refresh, login, logout
│   │   │   ├── workspaces/   # CRUD + member management
│   │   │   ├── posts/        # Create, list, delete posts
│   │   │   ├── query/        # AI query endpoint (SSE stream)
│   │   │   ├── webhooks/     # Webhook registration + management
│   │   │   ├── health/       # Health check endpoint
│   │   │   └── docs/         # Swagger UI
│   ├── lib/
│   │   ├── supabase/         # Client, server, admin clients
│   │   ├── auth/             # JWT utils, refresh rotation, RBAC middleware
│   │   ├── ai/               # Embedding, RAG pipeline, semantic cache
│   │   ├── queue/            # BullMQ job definitions + connection
│   │   ├── webhooks/         # Webhook dispatch logic
│   │   ├── logger/           # Pino logger setup + correlation IDs
│   │   └── utils/            # Shared helpers
│   ├── components/           # React components (Shadcn/UI based)
│   ├── hooks/                # Custom React hooks (useRealtime, usePresence)
│   └── types/                # Shared TypeScript types
├── worker/                   # Standalone BullMQ worker process
│   ├── jobs/
│   │   ├── embed-post.ts     # Chunk + embed + upsert to pgvector
│   │   ├── reindex.ts        # Re-embed workspace on model change
│   │   └── webhook-deliver.ts # Async webhook delivery + retry
│   └── index.ts              # Worker entry point
├── supabase/
│   └── migrations/           # SQL migrations (schema, RLS, pgvector)
├── tests/
│   ├── integration/          # Vitest + Supertest API tests
│   └── e2e/                  # Playwright E2E tests
├── docs/
│   ├── load-testing.md       # k6 results
│   └── architecture.md       # System design diagram notes
├── .github/workflows/ci.yml  # GitHub Actions pipeline
├── docker-compose.yml        # Local dev (PG, Redis, worker)
├── CLAUDE.md                 # This file
└── SPEC.md                   # Full project specification
```

## Architecture Rules
- Server Components by default; 'use client' only when state/interactivity needed
- All API routes go through RBAC middleware before handler logic
- Every API request gets a correlation ID (X-Request-ID header or generated UUID)
- Logger (Pino) must include: correlationId, userId, workspaceId, duration, status
- LLM calls go through OpenRouter — never hardcode a specific model provider
- Embeddings use nomic-embed-text via OpenRouter; dimension = 768
- pgvector uses cosine similarity; HNSW index on embedding column
- BullMQ jobs are idempotent — safe to retry on failure
- Webhook delivery retries 3x with exponential backoff (1s, 4s, 16s)
- Semantic cache key = hash of normalized query embedding; TTL = 1 hour
- Rate limiting: sliding window, 20 AI queries per user per hour

## Coding Standards
- TypeScript strict mode, no `any` types
- Use Zod for all request validation and env var validation
- Error handling: return typed error responses, never throw unhandled
- Prefer named exports; default export only for Next.js pages/layouts
- Co-locate tests with source when practical
- SQL migrations: one file per change, sequential numbering

## Commands
- Dev: `pnpm dev` (Next.js) + `pnpm worker:dev` (BullMQ worker)
- Test: `pnpm test` (Vitest) + `pnpm test:e2e` (Playwright)
- Lint: `pnpm lint` (ESLint + Prettier check)
- Typecheck: `pnpm typecheck` (tsc --noEmit)
- Build: `pnpm build`
- Docker local: `docker compose up`

## Usage Gate (MANDATORY)
- BETWEEN every sub-section (e.g., after 1.1, before starting 1.2), STOP and ask: "Ready for [next sub-section]. Please run /usage and tell me your percentage."
- WAIT for my response. Do NOT proceed without it.
- If I say ≥90%: save state to STATUS.md, commit WIP, and STOP completely.
- If I say <90%: proceed.
- Run `/project:usage-gate` if you forget this protocol.
- When saving state to STATUS.md, include: phase, completed sub-sections, modified files, remaining work, test status, known bugs.

## What Claude Gets Wrong (fix these)
- Don't use `localStorage` or `sessionStorage` — use React state or server-side sessions
- Don't import from `@supabase/auth-helpers-nextjs` — use `@supabase/ssr` instead
- Don't use `createClient` from `@supabase/supabase-js` directly in server components — use the server client helper
- Don't skip RLS policies — every table must have RLS enabled with explicit policies
- Don't put BullMQ connection logic inside API routes — use the shared connection from lib/queue
- Don't use `console.log` — use the Pino logger from lib/logger
- When compacting, preserve: current phase, modified files list, test status, and known bugs
