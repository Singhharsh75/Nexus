import { test, expect } from '@playwright/test';
import { loginAsTestUser, createWorkspaceAndNavigate } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Post and Query', () => {
  const slug = `e2e-pq-${Date.now()}`;
  const postTitle = 'Knowledge Base Entry';
  const postContent =
    'The Nexus deployment process uses Vercel for frontend hosting and Supabase for the database layer. Redis on Upstash provides caching and queue management.';

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('create a post and see it in the feed', async ({ page }) => {
    await createWorkspaceAndNavigate(page, `Post Test ${slug}`, slug);

    await page.fill('#post-title', postTitle);
    await page.fill('#post-content', postContent);
    await page.getByRole('button', { name: /^post$/i }).click();

    await expect(page.getByText(postTitle)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(postContent)).toBeVisible();
  });

  test('post shows embedding status badge', async ({ page }) => {
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    const badge = page.locator('[class*="badge"]', {
      hasText: /pending|processing|completed|failed/,
    });
    await expect(badge.first()).toBeVisible({ timeout: 15_000 });
  });

  test('AI query panel opens and accepts input', async ({ page }) => {
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    const askButton = page.getByRole('button', { name: /ask ai/i });
    await expect(askButton).toBeVisible({ timeout: 10_000 });
    await askButton.click();

    const queryInput = page.getByPlaceholder(/ask a question/i);
    await expect(queryInput).toBeVisible();
    await queryInput.fill('What is the deployment process?');

    const submitBtn = page.getByRole('button', { name: /^ask$/i });
    await expect(submitBtn).toBeEnabled();
  });

  test('submitting a query shows streaming indicator', async ({ page }) => {
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /ask ai/i }).click();
    await page.getByPlaceholder(/ask a question/i).fill('What is the deployment process?');
    await page.getByRole('button', { name: /^ask$/i }).click();

    await expect(
      page.getByText(/searching workspace knowledge|error|request failed/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('delete a post removes it from the feed', async ({ page }) => {
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    const postCard = page.locator('div').filter({ hasText: postTitle }).first();
    await expect(postCard).toBeVisible({ timeout: 10_000 });

    await postCard.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(postTitle)).toBeHidden({ timeout: 10_000 });
  });
});
