import { z } from 'zod/v4';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

function validateEnv(): WorkerEnv {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = z.prettifyError(parsed.error);
    console.error('Invalid worker environment variables:\n', formatted);
    throw new Error('Invalid worker environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();
