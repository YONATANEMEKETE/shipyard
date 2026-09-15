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
import { resetDatabase, prisma } from '../../../helpers/db.js';

/**
 * Auth extension — `POST /api/v1/auth/set-password` (integration).
 *
 * The route exists because better-auth's own `set-password` is `serverOnly`:
 * over HTTP it answers 404 while its neighbours answer 401, so an account
 * created through a linked provider has no way to gain a first password
 * without the reset-email detour. These cases pin the behaviour the settings
 * card depends on, including the namespace decision (settings stays at six
 * routes).
 */

const WEB_URL = 'http://localhost:3000';
const PASSWORD = 'sup3r-secret-pass';
const NEW_PASSWORD = 'even-more-secret-1';
const BASE = '/api/v1/auth/set-password';

type Request = ReturnType<typeof createTestApp>;

const uniqueEmail = (prefix: string) =>
  `${prefix}-${crypto.randomUUID()}@example.com`;

// `/api/v1/auth/*` success bodies pass through better-auth untouched (no
// `{ data }` wrapper), while our own route answers with the shared envelope —
// hence the two readers, as in the members suite.
function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

function dataOf<T>(res: { body: unknown }): T {
  return bodyOf<{ data: T }>(res).data;
}

/** Returns the joined cookie header (empty string when nothing was set). */
function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  return list
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split(';')[0] ?? '')
    .join('; ');
}

async function registerVerifiedUser(
  request: Request,
  email: string,
): Promise<{ cookies: string; userId: string }> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Test User', email, password: PASSWORD });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const last = sendEmailMock.mock.calls.at(-1)![0] as unknown as CapturedEmail;
  const linkMatch = /https?:\/\/\S+/u.exec(last.text ?? last.html);
  const token = new URL(linkMatch![0]).searchParams.get('token');

  const response = await createTestApp()
    .get(`/api/v1/auth/verify-email?token=${token}&callbackURL=%2F`)
    .set('Origin', WEB_URL);

  const cookies = cookieHeader(response);
  expect(cookies).toBeTruthy();

  const session = await createTestApp()
    .get('/api/v1/auth/get-session')
    .set('Cookie', cookies);
  const userId = bodyOf<{ user?: { id?: string } }>(session).user?.id;
  expect(userId).toBeTruthy();

  return { cookies, userId: userId as string };
}

/** Drops the credential row, which is exactly an OAuth-created account. */
async function withoutCredentialAccount(userId: string): Promise<void> {
  await prisma.account.deleteMany({
    where: { userId, providerId: 'credential' },
  });
}

beforeEach(async () => {
  await resetDatabase();
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ status: 'logged' });
});

describe('POST /api/v1/auth/set-password', () => {
  it('rejects an unauthenticated caller through the shared envelope', async () => {
    const res = await createTestApp()
      .post(BASE)
      .set('Origin', WEB_URL)
      .send({ newPassword: NEW_PASSWORD });

    // The route is mounted (not a 404 like better-auth's own serverOnly path);
    // better-auth's own session middleware is what refuses it.
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a password under the shared bound before touching better-auth', async () => {
    const { cookies } = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('set-short'),
    );

    const res = await createTestApp()
      .post(BASE)
      .set('Origin', WEB_URL)
      .set('Cookie', cookies)
      .send({ newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('gives an OAuth-only account a first password that actually signs in', async () => {
    const email = uniqueEmail('set-first');
    const { cookies, userId } = await registerVerifiedUser(
      createTestApp(),
      email,
    );
    await withoutCredentialAccount(userId);

    const res = await createTestApp()
      .post(BASE)
      .set('Origin', WEB_URL)
      .set('Cookie', cookies)
      .send({ newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(dataOf<{ hasPassword: boolean }>(res).hasPassword).toBe(true);

    const account = await prisma.account.findFirstOrThrow({
      where: { userId, providerId: 'credential' },
      select: { password: true },
    });
    expect(account.password).toBeTruthy();
    // Never the raw value.
    expect(account.password).not.toBe(NEW_PASSWORD);

    // The point of the whole route: the new password signs in.
    const signIn = await createTestApp()
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', WEB_URL)
      .send({ email, password: NEW_PASSWORD });
    expect(signIn.status).toBe(200);
  });

  it('refuses to overwrite an existing password', async () => {
    const email = uniqueEmail('set-exists');
    const { cookies } = await registerVerifiedUser(createTestApp(), email);

    const res = await createTestApp()
      .post(BASE)
      .set('Origin', WEB_URL)
      .set('Cookie', cookies)
      .send({ newPassword: NEW_PASSWORD });

    // 409 + the original code in details.auth, which is how the card tells
    // "someone else set one" from any other conflict.
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        details: { auth: 'PASSWORD_ALREADY_SET' },
      },
    });

    // The old password still works — nothing was overwritten.
    const signIn = await createTestApp()
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', WEB_URL)
      .send({
        email: (await prisma.user.findFirstOrThrow()).email,
        password: PASSWORD,
      });
    expect(signIn.status).toBe(200);
  });

  it('ignores a currentPassword, so it cannot bypass the change flow', async () => {
    const { cookies, userId } = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('set-ignore'),
    );
    await withoutCredentialAccount(userId);

    const res = await createTestApp()
      .post(BASE)
      .set('Origin', WEB_URL)
      .set('Cookie', cookies)
      .send({ newPassword: NEW_PASSWORD, currentPassword: 'whatever' });

    expect(res.status).toBe(200);
  });

  it('leaves the settings route table at six — no password path there', async () => {
    const { cookies } = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('set-namespace'),
    );

    for (const path of [
      '/api/v1/settings/password',
      '/api/v1/settings/change-password',
    ]) {
      const res = await createTestApp()
        .post(path)
        .set('Cookie', cookies)
        .send({ newPassword: NEW_PASSWORD });
      expect(res.status).toBe(404);
    }
  });
});
