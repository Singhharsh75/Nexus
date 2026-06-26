import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const queryDuration = new Trend('query_duration', true);
const queryFailRate = new Rate('query_failures');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '';

// Comma-separated list of tokens from distinct users to avoid single-user rate limiting (20/user/hour).
// Generate with: for each test user, call POST /api/auth/login and collect the access_token.
const tokens = (__ENV.ACCESS_TOKENS || __ENV.ACCESS_TOKEN || '').split(',').filter(Boolean);

const queries = [
  'What are the main project goals?',
  'How does authentication work?',
  'Summarize recent discussions about deployment',
  'What decisions were made about the database schema?',
  'Explain the caching strategy',
];

export const options = {
  scenarios: {
    ai_queries: {
      executor: 'constant-vus',
      vus: parseInt(__ENV.K6_VUS || '10', 10),
      duration: __ENV.K6_DURATION || '1m',
    },
  },
  thresholds: {
    query_duration: ['p(95)<10000'],
    query_failures: ['rate<0.1'],
  },
};

export default function () {
  if (tokens.length === 0) {
    console.error('Set ACCESS_TOKENS (comma-separated, one per user) or ACCESS_TOKEN env var');
    return;
  }

  const token = tokens[__VU % tokens.length];
  const query = queries[Math.floor(Math.random() * queries.length)];

  const res = http.post(
    `${BASE_URL}/api/workspaces/${WORKSPACE_ID}/query`,
    JSON.stringify({ query }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: '30s',
    },
  );

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => r.body && r.body.length > 0,
  });

  queryDuration.add(res.timings.duration);
  queryFailRate.add(!success);

  sleep(Math.random() * 2 + 1);
}
