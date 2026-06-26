import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const listWorkspacesDuration = new Trend('list_workspaces_duration', true);
const getWorkspaceDuration = new Trend('get_workspace_duration', true);
const listPostsDuration = new Trend('list_posts_duration', true);
const createPostDuration = new Trend('create_post_duration', true);
const healthDuration = new Trend('health_duration', true);
const apiFailRate = new Rate('api_failures');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || '';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '';

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ACCESS_TOKEN}`,
};

export const options = {
  scenarios: {
    crud_load: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.K6_RATE || '50', 10),
      timeUnit: '1s',
      duration: __ENV.K6_DURATION || '1m',
      preAllocatedVUs: 30,
      maxVUs: 80,
    },
  },
  thresholds: {
    list_workspaces_duration: ['p(95)<500'],
    get_workspace_duration: ['p(95)<500'],
    list_posts_duration: ['p(95)<500'],
    create_post_duration: ['p(95)<1000'],
    health_duration: ['p(95)<200'],
    api_failures: ['rate<0.05'],
  },
};

function listWorkspaces() {
  const res = http.get(`${BASE_URL}/api/workspaces`, { headers: authHeaders });
  check(res, { 'list workspaces 200': (r) => r.status === 200 }) || apiFailRate.add(true);
  listWorkspacesDuration.add(res.timings.duration);
}

function getWorkspace() {
  const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}`, { headers: authHeaders });
  check(res, { 'get workspace 200': (r) => r.status === 200 }) || apiFailRate.add(true);
  getWorkspaceDuration.add(res.timings.duration);
}

function listPosts() {
  const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/posts?limit=20`, { headers: authHeaders });
  check(res, { 'list posts 200': (r) => r.status === 200 }) || apiFailRate.add(true);
  listPostsDuration.add(res.timings.duration);
}

function createPost() {
  const payload = JSON.stringify({
    title: `Load test post ${Date.now()}`,
    content: `This is a load test post created at ${new Date().toISOString()}. It contains enough content to be meaningful for embedding tests.`,
  });
  const res = http.post(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/posts`, payload, { headers: authHeaders });
  check(res, { 'create post 201': (r) => r.status === 201 }) || apiFailRate.add(true);
  createPostDuration.add(res.timings.duration);
}

function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { 'health 200': (r) => r.status === 200 }) || apiFailRate.add(true);
  healthDuration.add(res.timings.duration);
}

const endpoints = [
  { fn: listWorkspaces, weight: 30 },
  { fn: getWorkspace, weight: 25 },
  { fn: listPosts, weight: 25 },
  { fn: createPost, weight: 10 },
  { fn: healthCheck, weight: 10 },
];

const weightedFns = [];
for (const ep of endpoints) {
  for (let i = 0; i < ep.weight; i++) {
    weightedFns.push(ep.fn);
  }
}

export default function () {
  const fn = weightedFns[Math.floor(Math.random() * weightedFns.length)];
  fn();
  sleep(0.1);
}
