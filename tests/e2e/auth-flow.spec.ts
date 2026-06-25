import { test, expect, type Page } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

const TEST_PASSWORD = 'TestPass123!secure';

function testEmail(): string {
  return `e2e-auth-${uuidv4().slice(0, 8)}@test.nexus`;
}

async function fillAndSubmitLogin(page: Page, email: string, password: string) {
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('Auth Flow', () => {
  let email: string;

  test.beforeEach(() => {
    email = testEmail();
  });

  test('signup → email confirmation screen shown', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText('Create your account')).toBeVisible();

    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', TEST_PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(
      page.getByText(/check your email/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('signup shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', 'wrong-password');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('signup shows error for short password', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('#email', email);
    await page.fill('#password', 'short');
    await page.fill('#confirmPassword', 'short');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(
      page.getByText(/password must be at least 8 characters/i),
    ).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmitLogin(page, 'nobody@example.com', 'wrongpassword');

    await expect(page.getByText(/invalid credentials|login failed/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
    await expect(page.getByText('Sign in to Nexus')).toBeVisible();
  });

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login');
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible();
    await signupLink.click();
    await page.waitForURL('**/signup');
    await expect(page.getByText('Create your account')).toBeVisible();
  });

  test('signup page has link to login', async ({ page }) => {
    await page.goto('/signup');
    const loginLink = page.getByRole('link', { name: /sign in/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await page.waitForURL('**/login');
    await expect(page.getByText('Sign in to Nexus')).toBeVisible();
  });
});
