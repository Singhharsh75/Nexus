import { NextResponse } from 'next/server';
import { withRole, type AuthorizedRequest } from '@/lib/auth/rbac';
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/auth/rate-limit';
import { createRequestLogger } from '@/lib/logger';
import { queryRequestSchema } from '@/types/query';
import { executeRAGQuery } from '@/lib/ai/rag-pipeline';

export const POST = withRole(async (request: Request, ctx: AuthorizedRequest) => {
  const log = createRequestLogger(ctx.correlationId, {
    userId: ctx.user.sub,
    workspaceId: ctx.workspaceId,
  });

  const body = await request.json();
  const parsed = queryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400, headers: { 'X-Request-ID': ctx.correlationId } },
    );
  }

  const rateLimit = await checkRateLimit(
    ctx.user.sub,
    'aiQuery',
    RATE_LIMITS.aiQuery,
  );

  if (!rateLimit.allowed) {
    log.warn('Rate limit exceeded for AI query');
    return rateLimitResponse(rateLimit.retryAfterMs!, ctx.correlationId);
  }

  log.info({ query: parsed.data.query.slice(0, 100) }, 'Starting RAG query');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of executeRAGQuery({
          query: parsed.data.query,
          workspaceId: ctx.workspaceId,
          userId: ctx.user.sub,
          correlationId: ctx.correlationId,
        })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
      } catch (err) {
        log.error({ error: err }, 'RAG query stream error');
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Internal error' })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-ID': ctx.correlationId,
    },
  });
}, 'query:create');
