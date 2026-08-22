import { test, expect } from '@playwright/test';

test('landing page loads and shows hero heading', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'The project machine',
  );
});

test('landing page has Get started button', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
});
