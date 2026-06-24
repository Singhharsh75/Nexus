import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  base: {
    env: process.env.NODE_ENV ?? 'development',
    service: 'api',
  },
});

interface RequestLoggerMeta {
  userId?: string;
  method?: string;
  path?: string;
  workspaceId?: string;
}

export function createRequestLogger(
  correlationId: string,
  meta?: RequestLoggerMeta,
) {
  return logger.child({ correlationId, ...meta });
}

export function getCorrelationId(headers: Headers): string {
  return headers.get('x-request-id') ?? uuidv4();
}

type RouteHandler = (request: Request, ...args: unknown[]) => Promise<Response>;

export function withRequestLogging(handler: RouteHandler): RouteHandler {
  return async (request: Request, ...args: unknown[]) => {
    const start = Date.now();
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const correlationId = getCorrelationId(request.headers);
    const log = createRequestLogger(correlationId, { method, path });

    try {
      const response = await handler(request, ...args);
      const duration_ms = Date.now() - start;
      log.info({ statusCode: response.status, duration_ms }, 'Request completed');
      return response;
    } catch (error) {
      const duration_ms = Date.now() - start;
      log.error(
        { duration_ms, error, stack: error instanceof Error ? error.stack : undefined },
        'Request failed with unhandled error',
      );
      throw error;
    }
  };
}
