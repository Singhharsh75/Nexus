import { z } from 'zod/v4';

export const queryRequestSchema = z.object({
  query: z.string().min(1).max(2000),
});

export type QueryRequest = z.infer<typeof queryRequestSchema>;

export interface Source {
  postId: string;
  chunkId: string;
  content: string;
  similarity: number;
  title?: string;
}

export type RAGEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'delta'; content: string }
  | { type: 'done'; cached: boolean; latencyMs: number }
  | { type: 'error'; message: string };
