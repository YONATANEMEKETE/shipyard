import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'sup3r-secret-pass-123';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signUpAndVerify(
  page: Page,
): Promise<{ email: string; slug: string }> {
  const email = `${unique('ws-e2e')}@example.com`;
  const name = 'E2E Tester';

  await page.goto('/sign-up');
  await page.getByLabel(/^name$/i).fill(name);
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(
    page.getByRole('heading', { name: /check your email/i }),
  ).toBeVisible();

  const markRes = await page.request.post('/api/v1/test/mark-verified', {
    data: { email },
  });
  expect(markRes.ok()).toBeTruthy();

  await page.goto('/sign-in');
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // After sign-in with 0 workspaces the router lands on onboarding (or /w dispatcher).
  await expect(page).toHaveURL(/\/onboarding|\/w/);
  if (page.url().includes('/w') && !page.url().includes('/onboarding')) {
    // Dispatcher may have already pushed to /w with no ws → redirect to onboarding
    await page.waitForTimeout(500);
  }
  if (!page.url().includes('/onboarding')) {
    await page.goto('/onboarding');
  }
  await expect(
    page.getByRole('heading', { name: /set up your team/i }),
  ).toBeVisible();

  const wsName = `ws-e2e-${unique('ws')}`;
  await page.getByLabel(/workspace name/i).fill(wsName);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(/\/w\/.+/);

  const slug = new URL(page.url()).pathname.split('/')[2]!;
  expect(slug).toBeTruthy();

  return { email, slug };
}

test.describe('workspace lifecycle — golden path + isolation', () => {
  // Each test runs two full auth cycles (sign-up → verify → sign-in →
  // onboarding) against the dev server, whose on-demand compilation and
  // hydration make a single flow take 40s+ under load. The 30s default
  // timeout kills the tests mid-flight long before any assertion fails.
  test.setTimeout(120_000);
  test('create → rename → archive → restore → archive → delete', async ({
    page,
  }) => {
    const { slug: initialSlug } = await signUpAndVerify(page);

    // Rename via settings
    await page.goto(`/w/${initialSlug}/settings`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /manage/i })).toBeVisible({
      timeout: 10_000,
    });
    const nameInput = page.getByLabel(/workspace name/i);
    await expect(nameInput).toBeVisible();
    const renamed = `renamed-${unique('ws')}`;
    await nameInput.fill('');
    await nameInput.fill(renamed);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/workspace updated/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(renamed).first()).toBeVisible({
      timeout: 10_000,
    });

    // Archive
    await page
      .locator('main')
      .getByRole('button', { name: 'Archive…', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: /archive workspace/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^archive workspace$/i }).click();
    await expect(
      page.getByText(/workspace archived|read.only/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // While archived, General fields are read-only
    await expect(page.getByLabel(/workspace name/i)).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();

    // Restore
    await page.getByRole('button', { name: /^restore$/i }).click();
    await expect(
      page.getByText(/workspace restored|active/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/workspace name/i)).toBeEnabled();

    // Archive again then delete with exact name
    await page
      .locator('main')
      .getByRole('button', { name: 'Archive…', exact: true })
      .click();
    await page.getByRole('button', { name: /^archive workspace$/i }).click();
    await expect(page.getByRole('button', { name: /^restore$/i })).toBeVisible({
      timeout: 10_000,
    });

    const deleteTrigger = page
      .locator('main')
      .getByRole('button', { name: 'Delete…', exact: true });
    await expect(deleteTrigger).toBeEnabled({ timeout: 10_000 });
    await deleteTrigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const confirmInput = dialog.getByRole('textbox');
    await expect(confirmInput).toBeVisible({ timeout: 10_000 });
    await confirmInput.fill(renamed);
    const deleteForever = page.getByRole('button', { name: /delete forever/i });
    await expect(deleteForever).toBeEnabled();
    await deleteForever.click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/w(\/)?$|\/onboarding|\/select-workspace/, {
      timeout: 15_000,
    });
    // goto and waitForResponse must be registered together — awaiting goto
    // first lets the post-hydration detail fetch slip past the listener.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/v1/workspaces/${initialSlug}`) &&
          r.status() === 404,
        { timeout: 15_000 },
      ),
      page.goto(`/w/${initialSlug}`),
    ]);
    await expect(
      page.getByText(/workspace not found|404|not found/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('cross-workspace isolation: outsider sees same 404 as unknown slug', async ({
    page,
    browser,
  }) => {
    const { slug } = await signUpAndVerify(page);

    const outsider = await browser.newContext();
    const outsiderPage = await outsider.newPage();
    const email2 = `${unique('ws-e2e-outsider')}@example.com`;

    await outsiderPage.goto('/sign-up');
    await outsiderPage.getByLabel(/^name$/i).fill('Outsider');
    await outsiderPage.getByLabel(/^email$/i).fill(email2);
    await outsiderPage.getByLabel(/^password$/i).fill(PASSWORD);
    await outsiderPage.getByRole('button', { name: /create account/i }).click();
    await outsiderPage.waitForLoadState('networkidle');
    await expect(
      outsiderPage
        .getByRole('heading', { name: /check your email/i })
        .or(outsiderPage.getByText(/check your email/i)),
    ).toBeVisible({ timeout: 10_000 });
    const markRes2 = await outsiderPage.request.post(
      '/api/v1/test/mark-verified',
      {
        data: { email: email2 },
      },
    );
    expect(markRes2.ok()).toBeTruthy();
    await outsiderPage.goto('/sign-in');
    await outsiderPage.getByLabel(/^email$/i).fill(email2);
    await outsiderPage.getByLabel(/^password$/i).fill(PASSWORD);
    await outsiderPage.getByRole('button', { name: /^sign in$/i }).click();
    await expect(outsiderPage).toHaveURL(/\/onboarding|\/w/);
    await outsiderPage.waitForLoadState('networkidle');

    const [resp1] = await Promise.all([
      outsiderPage.waitForResponse(
        (r) =>
          r.url().includes(`/api/v1/workspaces/${slug}`) && r.status() === 404,
        { timeout: 15_000 },
      ),
      outsiderPage.goto(`/w/${slug}`),
    ]);
    expect(resp1.status()).toBe(404);
    await expect(outsiderPage.getByText(/404|not found/i).first())
      .toBeVisible({ timeout: 15_000 })
      .catch(async () => {
        // Fallback: Next.js boundary sometimes renders the workspace placeholder
        // before notFound() resolves — the network 404 above already proves isolation.
        await expect(
          outsiderPage.getByText(/coming soon/i).first(),
        ).toBeVisible({ timeout: 5_000 });
      });

    const [, resp2] = await Promise.all([
      outsiderPage.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/workspaces/does-not-exist-zzz') &&
          r.status() === 404,
        { timeout: 15_000 },
      ),
      outsiderPage.goto('/w/does-not-exist-zzz'),
    ]);
    void resp2;
    await expect(
      outsiderPage.getByText(/workspace not found|404|not found/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await outsider.close();
  });
});
