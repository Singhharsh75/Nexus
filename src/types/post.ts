import { z } from 'zod/v4';

export const createPostSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().min(1).max(50000),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export interface Post {
  id: string;
  workspace_id: string;
  author_id: string;
  title: string | null;
  content: string;
  embedding_status: string;
  created_at: string;
  updated_at?: string;
}
