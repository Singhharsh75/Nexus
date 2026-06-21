# Nexus — Build Strategy & Learning Plan

---

## HOW TO USE CLAUDE CODE FOR THIS PROJECT

### Managing Your Session Usage (You're at 48%)

Your CLAUDE.md has a **usage gate** baked in. Here's how it works in practice:

**The flow:**
```
Claude: "Ready to start 1.2 — JWT Refresh Token Rotation. 
         Please run /usage and tell me your percentage."
You:     /usage
You:     "72%"
Claude:  [proceeds with 1.2]
  ...
Claude: "Ready to start 1.3 — RBAC Middleware. 
         Please run /usage and tell me your percentage."
You:     /usage  
You:     "91%"
Claude:  [saves STATUS.md, commits WIP, stops]
```

**Next session:**
```
You: /project:resume
Claude: [reads CLAUDE.md + SPEC.md + STATUS.md, verifies existing code, asks for usage check, continues]
```

**Two custom commands are set up for this:**
- `/project:usage-gate` — forces a usage check if Claude forgets
- `/project:resume` — picks up from where you left off in a new session

**Budget estimation per phase:**
- Phase 0 (scaffold): ~5-8% usage
- Phase 1 (auth): ~10-15% usage  
- Phase 2 (CRUD): ~8-12% usage
- Phase 3 (realtime): ~5-8% usage
- Phase 4 (RAG): ~15-20% usage (largest phase)
- Phase 5 (webhooks): ~5-8% usage
- Phase 6 (observability): ~5-8% usage
- Phase 7 (testing): ~10-15% usage
- Phase 8 (CI/CD): ~5-8% usage

At 48% remaining today, you can likely finish **one full phase** comfortably. 
I'd suggest starting with Phase 0 (scaffold + schema) since it's the foundation 
and uses the least budget (~5-8%).

---

### The Golden Rule: One Phase = One Fresh Session

The single most important practice. Claude Code's context degrades over long sessions.
After each phase:
1. Verify everything works (run the verification checklist)
2. Commit to git with a clear message
3. End the session
4. Start a FRESH session for the next phase

At the start of every new session, say:
```
Read CLAUDE.md and SPEC.md. We are starting PHASE [N]. 
Here's what's already done: [list completed phases].
Do not modify code from previous phases unless the spec requires it.
```

---

### Session Workflow (For Each Phase)

**Step 1 — Plan first, code second**

Start every phase with:
```
Read SPEC.md Phase [N]. Before writing any code, create a plan:
1. List every file you'll create or modify
2. List the order you'll work in
3. List what you'll verify at the end
Save this plan to PLAN-PHASE-[N].md
```

This takes 2 minutes and saves 30 minutes of corrections.

**Step 2 — Build incrementally, verify often**

Don't say "build the entire auth system." Instead:
```
Let's start with 1.1 — Supabase Auth Integration.
Create the signup and login pages, the callback route,
and the middleware. Stop after this sub-section so I can test.
```

After each sub-section:
- Run the app, test manually
- Run any applicable tests
- If something's wrong, correct immediately (tight feedback loop)

**Step 3 — Review before moving on**

After completing a phase:
```
Use a subagent to review the diff for Phase [N] against SPEC.md.
Check: every requirement implemented, edge cases handled,
no files outside this phase's scope modified, TypeScript strict passes.
```

Or use the built-in review:
```
/code-review
```

**Step 4 — Commit and close**
```
git add -A && git commit -m "Phase [N]: [description]"
```

Then END the session. Start fresh for the next phase.

---

### CLAUDE.md Maintenance

Your CLAUDE.md should stay under 150 lines. As you build:
- If Claude keeps making the same mistake, add a line to "What Claude Gets Wrong"
- If Claude does something correctly without being told, remove that instruction
- Review CLAUDE.md every 2-3 phases and prune

---

### Key Claude Code Commands To Use

| Command | When |
|---|---|
| `/compact focus on [what matters]` | When context is getting large mid-phase |
| `/clear` | When context is completely polluted — save state first |
| `/code-review` | After completing each phase |
| `/model` | Use Opus for planning, Sonnet for code generation |
| `/context` | Check how much context you've used |

---

### When Things Go Wrong

**Claude implements something differently than spec:**
Don't wrestle. Say: "Stop. Re-read SPEC.md Phase [N], section [X]. You deviated here: [describe]. Undo the last changes and follow the spec exactly."

**Claude's implementation is buggy:**
Run the tests. Copy the error output. Say: "Here's the test failure: [paste]. Fix this specific issue without changing anything else."

**Session feels degraded (Claude forgetting things, repeating mistakes):**
Save your current state to a file:
```
Save the current status of Phase [N] to STATUS.md — 
what's done, what's left, and any known issues.
```
Then start a fresh session with that status file.

---

## HOW TO LEARN (So You Can Defend Every Decision)

### The Anti-Vibe-Coding Protocol

The risk with Claude Code is building something you don't understand.
Here's how to prevent that — for each phase, BEFORE Claude builds it:

### Phase 0 — Schema + Setup
**Learn before building:**
- [ ] Read: [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)
- [ ] Understand: Why RLS is enforced at the DB level, not just API middleware
- [ ] Understand: What `uuid_generate_v4()` does vs `gen_random_uuid()`
- [ ] Understand: Why pgvector uses HNSW index, what `m` and `ef_construction` parameters mean
- [ ] Practice: Write one RLS policy by hand before Claude writes the rest

**Interview questions you must be able to answer:**
- "Why did you choose RLS over middleware-only auth?"
  → Defense in depth. Even if API middleware has a bug, the DB won't leak data.
- "What's the difference between IVFFlat and HNSW indexes in pgvector?"
  → HNSW: better recall, faster queries, more memory. IVFFlat: less memory, needs training step. I chose HNSW because the dataset is small enough and query speed matters for UX.
- "Why 768 dimensions for embeddings?"
  → nomic-embed-text-v1.5 outputs 768-dim vectors. This is the model's native dimension.

---

### Phase 1 — Auth System
**Learn before building:**
- [ ] Read: [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [ ] Understand: What refresh token rotation is and why it prevents token theft
- [ ] Understand: What a "token family" is and how replay detection works
- [ ] Understand: Why httpOnly cookies beat localStorage for tokens
- [ ] Understand: Sliding window vs fixed window rate limiting
- [ ] Draw: The refresh token rotation flow on paper (request → validate → rotate → respond)

**Interview questions you must be able to answer:**
- "Walk me through what happens when someone steals a refresh token."
  → If attacker uses the stolen token, a new token is issued. When the real user tries to refresh with the now-revoked token, the entire family is invalidated. Both attacker and user are logged out. User re-authenticates; attacker can't.
- "Why sliding window over fixed window for rate limiting?"
  → Fixed window has a burst problem at window boundaries (59 requests at 0:59, 60 at 1:01 = 119 in 2 seconds). Sliding window smooths this.
- "Why store token hashes, not the tokens themselves?"
  → Same reason you hash passwords. If the DB leaks, the attacker can't use the hashes to forge sessions.

---

### Phase 3 — Real-Time
**Learn before building:**
- [ ] Read: [Supabase Realtime docs — Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [ ] Read: [Supabase Realtime docs — Presence](https://supabase.com/docs/guides/realtime/presence)
- [ ] Understand: How Postgres CDC (Change Data Capture) works under the hood (WAL → logical replication → broadcast)
- [ ] Understand: The difference between Broadcast, Presence, and Postgres Changes channels
- [ ] Understand: Why you must unsubscribe on component unmount (memory leaks, zombie connections)

**Interview questions you must be able to answer:**
- "How does Supabase Realtime know when a row changes?"
  → It uses PostgreSQL's logical replication. Changes are read from the WAL (Write-Ahead Log) and broadcast to subscribed clients over WebSocket.
- "What happens if a user has two tabs open — do they show as two presences?"
  → Yes, each tab is a separate WebSocket connection with its own presence entry. You can deduplicate by user ID on the client side for display.
- "How do you handle cleanup when a user navigates away?"
  → useEffect cleanup function calls `channel.unsubscribe()`. Supabase also has a server-side timeout that removes stale presence entries.

---

### Phase 4 — RAG Pipeline
**Learn before building:**
- [ ] Read: [A guide to RAG chunking strategies](https://www.pinecone.io/learn/chunking-strategies/)
- [ ] Understand: Why chunk overlap matters (context continuity at chunk boundaries)
- [ ] Understand: Cosine similarity vs L2 distance for embedding comparison
- [ ] Understand: What "embedding" actually means (dense vector representation of semantic meaning)
- [ ] Understand: Why you filter by workspace_id BEFORE similarity search (don't compare across workspaces)
- [ ] Understand: What SSE (Server-Sent Events) is and how it differs from WebSockets
- [ ] Understand: What the OpenRouter API does (routes to multiple LLM providers via one endpoint)
- [ ] Build: A tiny standalone script that embeds one sentence and queries pgvector — before integrating into the app

**Interview questions you must be able to answer:**
- "Why did you choose SSE over WebSockets for streaming LLM responses?"
  → SSE is simpler for unidirectional server-to-client streaming (which is all LLM output needs). WebSockets add bidirectional complexity that isn't needed here. SSE also auto-reconnects, works through HTTP proxies, and is easier to debug.
- "How do you handle a post being updated after it's already been embedded?"
  → Delete existing chunks for that post, re-enqueue the embed-post job. The HNSW index handles the update. This is why jobs are idempotent.
- "What if two users query the same thing simultaneously?"
  → First query misses cache, generates answer, stores in cache. Second query (if it arrives after cache write) hits cache. If they're truly simultaneous, both miss cache and both call the LLM — we accept this duplication over adding locking complexity.
- "Why nomic-embed-text over OpenAI's text-embedding-3-small?"
  → Open-source model, cheaper via OpenRouter, 768 dimensions is a good balance of quality vs storage, and avoids vendor lock-in to OpenAI specifically.

---

### Phase 6 — Observability
**Learn before building:**
- [ ] Read: [Structured logging best practices](https://betterstack.com/community/guides/logging/structuring-logging-data/)
- [ ] Understand: Why JSON logs beat plaintext (parseable, filterable, queryable)
- [ ] Understand: What a correlation ID is and why it matters in distributed systems
- [ ] Understand: The difference between logging, monitoring, and tracing
- [ ] Understand: What a health check endpoint is used for (load balancer routing, alerting, SRE dashboards)

**Interview questions you must be able to answer:**
- "A user reports the AI gave a wrong answer 2 hours ago. How do you debug this?"
  → Get the correlationId from the user's browser network tab (X-Request-ID header). Search logs by correlationId. Find the API request log (shows query text, userId, workspaceId). Find the corresponding worker job log (shows which chunks were retrieved, similarity scores). Find the LLM call log (shows what context was sent, which model responded). This tells me: was it a retrieval problem (wrong chunks) or a generation problem (model hallucinated despite good context)?
- "Why Pino over Winston?"
  → Pino is significantly faster (5x+ benchmarks). It's JSON-native. Winston does synchronous logging by default which blocks the event loop. For an API that streams LLM responses, logging latency matters.

---

## REALISTIC BUILD TIMELINE

| Phase | Estimated Time | Learn First (hours) | Build (hours) |
|---|---|---|---|
| Phase 0: Scaffold + Schema | 2h | 1h reading RLS + pgvector docs | 1h |
| Phase 1: Auth System | 4h | 1.5h reading JWT/OWASP | 2.5h |
| Phase 2: Workspace + Posts | 3h | 0.5h (builds on Phase 1 knowledge) | 2.5h |
| Phase 3: Real-Time | 3h | 1h reading Supabase Realtime docs | 2h |
| Phase 4: RAG Pipeline | 5h | 2h reading chunking/embeddings/SSE | 3h |
| Phase 5: Webhooks | 2h | 0.5h reading HMAC signing | 1.5h |
| Phase 6: Observability | 2.5h | 1h reading structured logging | 1.5h |
| Phase 7: Testing | 3h | 0.5h Playwright docs | 2.5h |
| Phase 8: CI/CD + Deploy | 2.5h | 0.5h GitHub Actions docs | 2h |
| **Total** | **~27h** | **~8.5h learning** | **~19h building** |

Spread over 2 weeks at 2-3 hours/day, this is very doable.

---

## POST-BUILD: PREPARE FOR INTERVIEWS

After the project is complete, do these three things:

### 1. Write the Architecture Decision Record
Create `docs/architecture.md` explaining WHY you chose each technology.
Not what it does — why you picked it over alternatives.
This document is your interview cheat sheet.

### 2. Break Your Own Project
- Try to access workspace data without being a member (test RLS)
- Try to use a revoked refresh token (test replay detection)
- Send 100 queries in a minute (test rate limiting)
- Kill Redis and see what the health endpoint reports
- Send a malformed webhook URL and verify retry + failure logging

Every bug you find and fix is an interview story.

### 3. Record a 3-Minute Demo Video
Walk through: signup → create workspace → create post → wait for embedding → 
query workspace → show streamed cited answer → show real-time in second tab → 
show health endpoint → show logs with correlation ID.

This video goes on your resume's GitHub link and LinkedIn.
Recruiters who see a working demo skip to the interview stage.
