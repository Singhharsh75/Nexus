import OpenAI from 'openai';
import { env } from '@/lib/env';

let client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return client;
}
