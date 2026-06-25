import type { Page } from '@playwright/test';

export async function waitForEmbedding(
  page: Page,
  workspaceId: string,
  postId: string,
  {
    timeout = 30_000,
    interval = 1_000,
  }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const baseURL =
    page.context().baseURL() ?? 'http://localhost:3000';

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const response = await page.request.get(
      `${baseURL}/api/workspaces/${workspaceId}/posts/${postId}`,
    );

    if (response.ok()) {
      const data = await response.json();
      if (data.embedding_status === 'completed') {
        return;
      }
      if (data.embedding_status === 'failed') {
        throw new Error(`Embedding failed for post ${postId}`);
      }
    }

    await page.waitForTimeout(interval);
  }

  throw new Error(
    `Embedding for post ${postId} did not complete within ${timeout}ms`,
  );
}
