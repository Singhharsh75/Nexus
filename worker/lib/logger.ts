import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  base: {
    env: process.env.NODE_ENV ?? 'development',
    service: 'worker',
  },
});

export function createJobLogger(
  jobId: string | undefined,
  correlationId: string,
  meta?: Record<string, unknown>,
) {
  return logger.child({ jobId, correlationId, ...meta });
}
