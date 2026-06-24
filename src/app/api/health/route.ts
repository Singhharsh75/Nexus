import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis';
import { logger, getCorrelationId, createRequestLogger } from '@/lib/logger';

const APP_VERSION = process.env.npm_package_version ?? '1.0.0';
const startedAt = Date.now();

interface CheckResult {
  status: 'up' | 'down';
  latency_ms: number;
  error?: string;
}

interface WorkerCheckResult {
  status: 'up' | 'down';
  latency_ms?: number;
  last_heartbeat?: string;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('workspaces').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw error;
    return { status: 'up', latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    await redis.ping();
    return { status: 'up', latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkWorker(): Promise<WorkerCheckResult> {
  try {
    const redis = getRedisClient();
    const heartbeat = await redis.get('worker:heartbeat');
    if (!heartbeat) {
      return { status: 'down', error: 'No heartbeat found' };
    }
    const lastBeat = new Date(heartbeat);
    if (Number.isNaN(lastBeat.getTime())) {
      return { status: 'down', last_heartbeat: heartbeat, error: 'Invalid heartbeat timestamp' };
    }
    const ageMs = Date.now() - lastBeat.getTime();
    if (ageMs > 120_000) {
      return {
        status: 'down',
        last_heartbeat: heartbeat,
        error: 'Heartbeat stale (>120s)',
      };
    }
    return { status: 'up', last_heartbeat: heartbeat };
  } catch (err) {
    return {
      status: 'down',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function GET(request: Request) {
  const start = Date.now();
  const correlationId = getCorrelationId(request.headers);
  const log = createRequestLogger(correlationId, { method: 'GET', path: '/api/health' });

  const [database, redis, worker] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWorker(),
  ]);

  const checks = { database, redis, worker };
  const allUp = database.status === 'up' && redis.status === 'up' && worker.status === 'up';
  const downCount = [database, redis, worker].filter((c) => c.status === 'down').length;
  const overallStatus = downCount >= 2 ? 'unhealthy' : allUp ? 'healthy' : 'degraded';

  const body = {
    status: overallStatus,
    checks,
    version: APP_VERSION,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  const duration_ms = Date.now() - start;

  log.info({ health: overallStatus, statusCode: httpStatus, duration_ms }, 'Health check');

  return NextResponse.json(body, {
    status: httpStatus,
    headers: { 'X-Request-ID': correlationId },
  });
}
