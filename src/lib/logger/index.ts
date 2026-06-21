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
