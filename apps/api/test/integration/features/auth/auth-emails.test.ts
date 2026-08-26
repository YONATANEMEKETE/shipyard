import { describe, it, expect, beforeEach, vi } from 'vitest';

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn<(message: CapturedEmail) => Promise<unknown>>(),
}));

vi.mock('../../../../src/lib/mailer.js', () => ({ sendEmail: sendEmailMock }));

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';

const uniqueEmail = () => `email-contract-${crypto.randomUUID()}@example.com`;
const PASSWORD = 'sup3r-secret-pass';

function lastEmail(): CapturedEmail {
  const calls = sendEmailMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls.at(-1)![0];
}

function linkFromEmail(message: ReturnType<typeof lastEmail>): URL {
  const match = /https?:\/\/\S+/u.exec(message.text ?? message.html);
  expect(match, 'email should contain a link').toBeTruthy();
  return new URL(match![0]);
}

describe('auth email link contracts (integration)', () => {
  let email: string;

  beforeEach(async () => {
    await resetDatabase();
    email = uniqueEmail();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });
  });

  it('verification email links to the web verify-email page (query token)', async () => {
    await createTestApp()
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', env.WEB_URL)
      .send({ name: 'Email Contract', email, password: PASSWORD });

    const url = linkFromEmail(lastEmail());
    // The page owns the post-click experience — the link must target the
    // web route, never the API endpoint.
    expect(`${url.origin}${url.pathname}`).toBe(`${env.WEB_URL}/verify-email`);
    expect(url.searchParams.get('token')).toBeTruthy();
  });

  it('reset-password email links to the API callback endpoint (path token)', async () => {
    await createTestApp()
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', env.WEB_URL)
      .send({ name: 'Email Contract', email, password: PASSWORD });

    const response = await createTestApp()
      .post('/api/v1/auth/request-password-reset')
      .set('Origin', env.WEB_URL)
      .send({ email, redirectTo: '/reset-password' });
    expect(response.status).toBe(200);

    const url = linkFromEmail(lastEmail());
    // v1.7 shape: an endpoint path carrying the token, which validates and
    // redirects to the callback URL with a fresh ?token= for the page.
    expect(url.pathname).toMatch(/^\/api\/v1\/auth\/reset-password\/[^/]+$/);
    expect(url.searchParams.get('callbackURL')).toBe('/reset-password');
  });

  it('reset request for an unknown email answers identically', async () => {
    await createTestApp()
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', env.WEB_URL)
      .send({ name: 'Email Contract', email, password: PASSWORD });

    sendEmailMock.mockClear();

    const response = await createTestApp()
      .post('/api/v1/auth/request-password-reset')
      .set('Origin', env.WEB_URL)
      .send({
        email: `unknown-${crypto.randomUUID()}@example.com`,
        redirectTo: '/reset-password',
      });

    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('verification email is addressed to the signing-up user only', async () => {
    await createTestApp()
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', env.WEB_URL)
      .send({ name: 'Email Contract', email, password: PASSWORD });

    const message = lastEmail();
    expect(message.to).toBe(email);
    expect(message.subject.toLowerCase()).toContain('verify');
    sendEmailMock.mock.calls.forEach(([sent]) => {
      expect((sent as { to: string }).to).toBe(email);
    });
  });
});
