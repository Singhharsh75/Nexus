import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Workspace Flow', () => {
  const workspaceName = `E2E Test ${Date.now()}`;
  const workspaceSlug = `e2e-test-${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('create a workspace from the dashboard', async ({ page }) => {
    await expect(page.getByText('Workspaces')).toBeVisible();

    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText('Create a new workspace')).toBeVisible();

    await page.fill('#ws-name', workspaceName);
    await page.fill('#ws-slug', workspaceSlug);
    await page.getByRole('button', { name: /^create$/i }).click();

    await expect(page.getByText(workspaceName)).toBeVisible({ timeout: 10_000 });
  });

  test('navigate into workspace from dashboard', async ({ page }) => {
    await page.getByText(workspaceName).first().click();
    await page.waitForURL(`**/workspace/${workspaceSlug}`, { timeout: 10_000 });

    await expect(
      page.getByRole('heading', { name: workspaceName }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('admin can access workspace settings', async ({ page }) => {
    await page.goto(`/workspace/${workspaceSlug}`);
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.getByRole('button', { name: /settings/i });
    await expect(settingsBtn).toBeVisible({ timeout: 10_000 });
    await settingsBtn.click();

    await page.waitForURL(`**/workspace/${workspaceSlug}/settings`);
    await expect(page.getByText('Workspace Settings')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('workspace settings has members tab', async ({ page }) => {
    await page.goto(`/workspace/${workspaceSlug}/settings`);
    await page.waitForLoadState('networkidle');

    const membersTab = page.getByRole('tab', { name: /members/i });
    await expect(membersTab).toBeVisible({ timeout: 10_000 });
    await membersTab.click();

    await expect(page.getByText('Members')).toBeVisible();
    await expect(page.getByText(/email/i).first()).toBeVisible();
  });

  test('delete workspace from danger zone', async ({ page }) => {
    await page.goto(`/workspace/${workspaceSlug}/settings`);
    await page.waitForLoadState('networkidle');

    const dangerTab = page.getByRole('tab', { name: /danger/i });
    await expect(dangerTab).toBeVisible({ timeout: 10_000 });
    await dangerTab.click();

    await page.getByRole('button', { name: /delete workspace/i }).click();
    await expect(page.getByText(/this action cannot be undone/i)).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    await page.waitForURL('**/dashboard', { timeout: 10_000 });
  });
});
