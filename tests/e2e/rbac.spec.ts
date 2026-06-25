import { test, expect } from '@playwright/test';
import {
  loginAsTestUser,
  loginAsSecondUser,
  createWorkspaceAndNavigate,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('RBAC Enforcement', () => {
  const slug = `e2e-rbac-${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsTestUser(page);
      await createWorkspaceAndNavigate(page, `RBAC Test ${slug}`, slug);

      await page.getByRole('button', { name: /settings/i }).click();
      await page.waitForURL(`**/workspace/${slug}/settings`);

      await page.getByRole('tab', { name: /members/i }).click();

      const user2Email = process.env.E2E_USER2_EMAIL;
      if (!user2Email) {
        throw new Error('E2E_USER2_EMAIL env var required');
      }

      await page.getByText('Invite Member').click();
      await page.fill('#invite-email', user2Email);
      await page.getByRole('button', { name: /^invite$/i }).click();

      await expect(page.getByText(user2Email)).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('viewer cannot see post creation form', async ({ page }) => {
    await loginAsSecondUser(page);
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: `RBAC Test ${slug}` }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('#post-content')).toBeHidden({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /^post$/i })).toBeHidden();
  });

  test('viewer cannot access settings page', async ({ page }) => {
    await loginAsSecondUser(page);
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: `RBAC Test ${slug}` }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /settings/i }),
    ).toBeHidden({ timeout: 5_000 });
  });

  test('viewer cannot access webhooks page directly', async ({ page }) => {
    await loginAsSecondUser(page);
    await page.goto(`/workspace/${slug}/webhooks`);
    await page.waitForLoadState('networkidle');

    await page.waitForURL(
      (url) => !url.pathname.includes('/webhooks'),
      { timeout: 10_000 },
    );
  });

  test('admin can see post creation form', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(`/workspace/${slug}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: `RBAC Test ${slug}` }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('#post-content')).toBeVisible();
    await expect(page.getByRole('button', { name: /^post$/i })).toBeVisible();
  });

  test('admin can access webhooks page', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(`/workspace/${slug}/webhooks`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Registered Webhooks')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Add Webhook')).toBeVisible();
  });
});
