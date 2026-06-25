import { test, expect } from '@playwright/test';
import { loginAsTestUser, createWorkspaceAndNavigate } from './helpers';

test.describe('Realtime', () => {
  const slug = `e2e-rt-${Date.now()}`;

  test('post created in one tab appears in another', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await loginAsTestUser(page1);
      await createWorkspaceAndNavigate(page1, `RT Test ${slug}`, slug);

      await loginAsTestUser(page2);
      await page2.goto(`/workspace/${slug}`);
      await page2.waitForLoadState('networkidle');
      await expect(
        page2.getByRole('heading', { name: `RT Test ${slug}` }),
      ).toBeVisible({ timeout: 10_000 });

      await page2.waitForFunction(() => {
        const supabaseKey = Object.keys(window).find((k) =>
          k.startsWith('__supabase'),
        );
        return supabaseKey !== undefined;
      }, { timeout: 10_000 }).catch(() => {
        // Fallback: wait for network to settle if Supabase global isn't exposed
      });
      await page2.waitForLoadState('networkidle');

      const postTitle = `Realtime Post ${Date.now()}`;
      await page1.fill('#post-title', postTitle);
      await page1.fill('#post-content', 'This post should appear in real time.');
      await page1.getByRole('button', { name: /^post$/i }).click();

      await expect(page1.getByText(postTitle)).toBeVisible({ timeout: 10_000 });

      await expect(page2.getByText(postTitle)).toBeVisible({ timeout: 15_000 });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('presence indicators show online users', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    try {
      await loginAsTestUser(page1);
      await page1.goto(`/workspace/${slug}`);
      await page1.waitForLoadState('networkidle');

      const presenceIndicator = page1.locator('.bg-green-500');
      await expect(presenceIndicator).toBeVisible({ timeout: 15_000 });
    } finally {
      await context1.close();
    }
  });
});
