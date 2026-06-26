# Contributing to Nexus

Thanks for your interest in contributing! This guide covers the setup, standards, and process for submitting changes.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Docker](https://www.docker.com/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Getting Started

```bash
git clone https://github.com/Singhharsh75/Nexus.git
cd Nexus
pnpm install
cp .env.local.example .env.local
```

Fill in the environment variables in `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379`) |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM + embeddings |
| `JWT_SECRET` | Secret for JWT signing (min 32 characters) |

Start the development environment:

```bash
docker compose up -d       # Redis
supabase start             # Local Supabase
pnpm dev                   # Next.js dev server
pnpm worker:dev            # BullMQ worker (separate terminal)
```

## Branch Naming

Use descriptive prefixes:

- `feature/add-workspace-search` — new functionality
- `fix/token-refresh-loop` — bug fixes
- `docs/update-api-examples` — documentation changes
- `refactor/simplify-rag-pipeline` — code improvements

## Commit Messages

Write concise commit messages that explain **what** and **why**:

```
Add semantic cache invalidation on post update

Previously cached query results could return stale content after a post
was edited. Cache entries are now invalidated when the source post changes.
```

## Pull Request Process

1. Create a branch from `master`
2. Make your changes following the coding standards below
3. Ensure all checks pass locally:
   ```bash
   pnpm lint          # ESLint
   pnpm typecheck     # TypeScript strict
   pnpm test          # Integration tests
   ```
4. Push and open a PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md)
5. All CI checks must pass before merge

## Testing Requirements

- **All new features** must include integration tests (Vitest + Supertest)
- **UI changes** should include E2E coverage (Playwright)
- **Bug fixes** should include a regression test when practical
- Run the full suite before submitting: `pnpm test && pnpm test:e2e`

## Code Style

- **TypeScript strict mode** — no `any` types
- **Zod** for all request validation
- **Pino logger** — never use `console.log`
- **Named exports** — default exports only for Next.js pages/layouts
- **`@supabase/ssr`** — not `@supabase/auth-helpers-nextjs`
- Run `pnpm lint` and `pnpm typecheck` before committing

## Reporting Issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs and the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for suggestions.
