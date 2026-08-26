import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorResponseSchema } from '@shipyard/shared';

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock('../../../../src/lib/mailer.js', () => ({ sendEmail: sendEmailMock }));

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase, prisma } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';
const uniqueEmail = () => `auth-envelope-${crypto.randomUUID()}@example.com`;

async function signUp(email: string) {
  return createTestApp()
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Envelope Test', email, password: PASSWORD });
}

async function signUpVerified(email: string) {
  const request = createTestApp();
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Envelope Test', email, password: PASSWORD });
  await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
  });
  return request;
}

describe('auth error envelope contract', () => {
  beforeEach(async () => {
    await resetDatabase();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });
  });

  describe('malformed sign-up input', () => {
    it('maps PASSWORD_TOO_SHORT to a 400 VALIDATION_ERROR envelope', async () => {
      const response = await createTestApp()
        .post('/api/v1/auth/sign-up/email')
        .set('Origin', WEB_URL)
        .send({
          name: 'Envelope Test',
          email: uniqueEmail(),
          password: 'short',
        });

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect((body.error.details as { auth?: string }).auth).toBe(
        'PASSWORD_TOO_SHORT',
      );
    });
  });

  describe('invalid credentials', () => {
    it('maps INVALID_EMAIL_OR_PASSWORD to a 401 UNAUTHORIZED envelope', async () => {
      const email = uniqueEmail();
      await signUp(email);

      const response = await createTestApp()
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', WEB_URL)
        .send({ email, password: 'definitely-wrong-password' });

      expect(response.status).toBe(401);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).not.toMatch(/stack|sql|prisma/i);
      expect((body.error.details as { auth?: string }).auth).toBe(
        'INVALID_EMAIL_OR_PASSWORD',
      );
    });
  });

  describe('unknown auth endpoint', () => {
    it('does not rewrite non-JSON responses into the envelope', async () => {
      const response = await createTestApp().get('/api/v1/auth/does-not-exist');

      // Better Auth answers with its own 404; the adapter must leave
      // unrecognized payloads untouched rather than guessing.
      expect(response.status).toBe(404);
      const parsed = errorResponseSchema.safeParse(response.body);
      if (parsed.success) {
        throw new Error(
          'Non-JSON auth response was rewritten into the envelope',
        );
      }
    });
  });

  describe('success responses', () => {
    it('passes sign-up success through untouched (no envelope)', async () => {
      const response = await signUp(uniqueEmail());

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('error');
      // autoSignIn is false, so the response carries a synthetic user and no
      // session cookie — the adapter must not have wrapped it in an envelope
      const body = response.body as { user?: { email?: string } };
      expect(body.user?.email).toBeDefined();
    });
  });
  describe('adapter edge cases', () => {
    it('preserves the reset-password redirect instead of rewriting it', async () => {
      const email = `reset-${crypto.randomUUID()}@example.com`;
      const request = await signUpVerified(email);
      await request
        .post('/api/v1/auth/request-password-reset')
        .set('Origin', WEB_URL)
        .send({ email, redirectTo: '/reset-password' });

      // The email link is the API callback endpoint with a path token
      // (v1.7); capture it from the logged email.
      expect(sendEmailMock.mock.calls.length).toBeGreaterThan(0);
      const message = sendEmailMock.mock.calls.at(-1)![0] as { text?: string };
      const url = /https?:\/\/\S+/u.exec(message.text ?? '')?.[0] ?? '';
      expect(url).toContain('/api/v1/auth/reset-password/');

      const response = await createTestApp().get(url.replace(env.WEB_URL, ''));

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/reset-password?token=');
    });

    it('passes the session cookie through on sign-in', async () => {
      const email = `cookie-${crypto.randomUUID()}@example.com`;
      await signUpVerified(email);

      const response = await createTestApp()
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', WEB_URL)
        .send({ email, password: PASSWORD });

      expect(response.status).toBe(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(
        cookies?.some((c) => c.startsWith('better-auth.session_token=')),
      ).toBe(true);
    });

    it('answers malformed JSON bodies with a BAD_REQUEST envelope', async () => {
      const response = await createTestApp()
        .post('/api/v1/auth/sign-up/email')
        .set('Content-Type', 'application/json')
        .send('{"broken":');

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });
});
