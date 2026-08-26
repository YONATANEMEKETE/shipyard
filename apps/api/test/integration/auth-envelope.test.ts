import { describe, it, expect, beforeEach } from 'vitest';
import { errorResponseSchema } from '@shipyard/shared';
import { createTestApp } from '../helpers/app.js';
import { resetDatabase } from '../helpers/db.js';

const uniqueEmail = () => `auth-envelope-${crypto.randomUUID()}@example.com`;
const validPassword = 'sup3r-secret-pass';

async function signUp(email: string) {
  const request = createTestApp();
  return request.post('/api/v1/auth/sign-up/email').send({
    name: 'Envelope Test',
    email,
    password: validPassword,
  });
}

describe('auth error envelope contract', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('malformed sign-up input', () => {
    it('maps PASSWORD_TOO_SHORT to a 400 VALIDATION_ERROR envelope', async () => {
      const response = await createTestApp()
        .post('/api/v1/auth/sign-up/email')
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
});
