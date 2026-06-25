import type { Page } from '@playwright/test';

export async function loginAsTestUser(page: Page) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_USER_EMAIL and E2E_USER_PASSWORD env vars required');
  }

  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export async function loginAsSecondUser(page: Page) {
  const email = process.env.E2E_USER2_EMAIL;
  const password = process.env.E2E_USER2_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_USER2_EMAIL and E2E_USER2_PASSWORD env vars required');
  }

  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export async function createWorkspaceAndNavigate(
  page: Page,
  name: string,
  slug: string,
) {
  await page.getByRole('button', { name: /create workspace/i }).click();
  await page.fill('#ws-name', name);
  await page.fill('#ws-slug', slug);
  await page.getByRole('button', { name: /^create$/i }).click();
  await page.getByText(name).first().waitFor({ timeout: 10_000 });
  await page.getByText(name).first().click();
  await page.waitForURL(`**/workspace/${slug}`, { timeout: 10_000 });
}
