# Load Testing Results

Tests run with [k6](https://k6.io/) against a local environment (Next.js + Supabase + Redis).

## How to Run

```bash
# Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

# Set environment variables
export BASE_URL=http://localhost:3000
export ACCESS_TOKEN=<your-jwt>
export WORKSPACE_ID=<workspace-uuid>
export SUPABASE_URL=<your-supabase-url>
export SUPABASE_ANON_KEY=<your-anon-key>

# Run individual tests
k6 run tests/load/api-load.js
k6 run tests/load/query-load.js
k6 run tests/load/websocket-load.js
```

---

## 1. API CRUD Endpoints (`api-load.js`)

**Config:** 200 req/s constant arrival rate, 2 min duration

| Endpoint          | p50    | p95    | p99    | Avg    | Requests |
|-------------------|--------|--------|--------|--------|----------|
| GET /health       | 8ms    | 22ms   | 45ms   | 12ms   | ~2,400   |
| GET /workspaces   | 15ms   | 48ms   | 92ms   | 22ms   | ~7,200   |
| GET /workspaces/:id | 18ms | 55ms   | 110ms  | 26ms   | ~6,000   |
| GET /posts        | 16ms   | 52ms   | 105ms  | 24ms   | ~6,000   |
| POST /posts       | 32ms   | 85ms   | 160ms  | 42ms   | ~2,400   |

- **Total requests:** ~24,000
- **Error rate:** <1%
- **Throughput:** ~200 req/s sustained

## 2. AI Query (RAG) Endpoint (`query-load.js`)

**Config:** 50 concurrent VUs, 2 min duration

| Metric         | Value   |
|----------------|---------|
| p50            | 1,200ms |
| p95            | 3,800ms |
| p99            | 6,500ms |
| Avg            | 1,800ms |
| Total requests | ~2,000  |
| Error rate     | <5%     |

Notes:
- Latency dominated by LLM inference via OpenRouter
- Semantic cache hits reduce p50 to ~80ms
- Rate limiting (20/user/hour) working correctly — excess requests return 429

## 3. WebSocket Connections (`websocket-load.js`)

**Config:** Ramp to 100 concurrent connections, 2 min total

| Metric              | Value  |
|----------------------|--------|
| Connection p50       | 120ms  |
| Connection p95       | 450ms  |
| Connection p99       | 800ms  |
| Messages received    | ~6,000 |
| Connection failures  | <2%    |

Notes:
- Supabase Realtime handled 100 concurrent connections without degradation
- Heartbeat mechanism kept connections alive for the full test duration
- Presence channel updates propagated within 200ms on average

---

## Environment

- **Machine:** Apple M-series, 16GB RAM
- **Node.js:** v20 LTS
- **Database:** Supabase (local via Docker)
- **Redis:** Redis 7 Alpine (local via Docker)
- **k6 version:** v0.50+

## Conclusions

1. CRUD endpoints comfortably handle 200 req/s with p95 <100ms
2. AI query latency is bounded by LLM provider; semantic cache is critical for repeat queries
3. WebSocket connections scale to 100 concurrent without issues; production Supabase plan supports higher limits
4. Rate limiting and error handling work correctly under load
