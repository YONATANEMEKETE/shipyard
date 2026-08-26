import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorResponseSchema } from '@shipyard/shared';

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn<(message: CapturedEmail) => Promise<unknown>>(),
}));

// Capture outbound emails (NODE_ENV=test logs anyway; the mock lets us
// read the generated links).
vi.mock('../../../../src/lib/mailer.js', () => ({ sendEmail: sendEmailMock }));

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';

const uniqueEmail = () => `lifecycle-${crypto.randomUUID()}@example.com`;

interface AuthUserBody {
  user?: { email: string; emailVerified: boolean } | null;
  token?: string | null;
}

function bodyOf<T = Record<string, unknown>>(response: { body: unknown }): T {
  return response.body as T;
}

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

/** Joins a supertest set-cookie array into a Cookie request header. */
function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw: unknown = response.headers['set-cookie'];
  let list: string[];
  if (typeof raw === 'string') {
    list = [raw];
  } else if (Array.isArray(raw)) {
    list = raw.filter((v): v is string => typeof v === 'string');
  } else {
    list = [];
  }
  expect(list.length, 'expected session cookie(s)').toBeGreaterThan(0);
  return list.map((cookie) => cookie.split(';')[0] ?? '').join('; ');
}

describe('auth lifecycle (integration)', () => {
  let email: string;

  beforeEach(async () => {
    await resetDatabase();
    email = uniqueEmail();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });
  });

  async function signUp(
    request: ReturnType<typeof createTestApp>,
    e: string = email,
  ) {
    return request
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', WEB_URL)
      .send({ name: 'Lifecycle Test', email: e, password: PASSWORD });
  }

  async function verify(): Promise<string> {
    await signUp(createTestApp());
    const token = linkFromEmail(lastEmail()).searchParams.get('token');
    const response = await createTestApp()
      .get(`/api/v1/auth/verify-email?token=${token}&callbackURL=%2F`)
      .set('Origin', WEB_URL);
    expect(response.status).toBe(302);
    return cookieHeader(response);
  }

  it('sign-up creates an unverified user without a session', async () => {
    const response = await signUp(createTestApp());

    expect(response.status).toBe(200);
    const body = bodyOf<AuthUserBody>(response);
    expect(body.user?.email).toBe(email);
    expect(body.user?.emailVerified).toBe(false);
    expect(body.token).toBeNull();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('repeated sign-up answers identically without leaking existence', async () => {
    await signUp(createTestApp());

    const second = await signUp(createTestApp());
    expect(second.status).toBe(200);
    expect(bodyOf<AuthUserBody>(second).token).toBeNull();
  });

  it('verification email links to the web page with a token', async () => {
    await signUp(createTestApp());

    const url = linkFromEmail(lastEmail());
    expect(url.origin).toBe(WEB_URL);
    expect(url.pathname).toBe('/verify-email');
    expect(url.searchParams.get('token')?.length).toBeGreaterThan(20);
  });

  it('sign-in before verification is rejected with an UNAUTHORIZED envelope', async () => {
    await signUp(createTestApp());

    const response = await createTestApp()
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', WEB_URL)
      .send({ email, password: PASSWORD });

    expect(response.status).toBe(401);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('clicking the verification link signs the user in', async () => {
    const cookies = await verify();
    expect(cookies).toContain('better-auth.session_token=');
  });

  it('session endpoint reflects the signed-in state', async () => {
    const cookies = await verify();

    const session = await createTestApp()
      .get('/api/v1/auth/get-session')
      .set('Cookie', cookies);

    expect(session.status).toBe(200);
    expect(bodyOf<{ user?: { email?: string } }>(session).user?.email).toBe(
      email,
    );
  });

  it('sign-in after verification succeeds and issues a session cookie', async () => {
    await verify();

    const response = await createTestApp()
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', WEB_URL)
      .send({ email, password: PASSWORD, rememberMe: true });

    expect(response.status).toBe(200);
    expect(cookieHeader(response)).toContain('better-auth.session_token=');
  });

  it('sign-out invalidates the session', async () => {
    const cookies = await verify();

    const request = createTestApp();
    const signOut = await request
      .post('/api/v1/auth/sign-out')
      .set('Cookie', cookies)
      .set('Origin', WEB_URL)
      // Match the real client, which always sends a JSON content-type
      .send({});
    expect(signOut.status).toBe(200);

    const session = await createTestApp()
      .get('/api/v1/auth/get-session')
      .set('Cookie', cookies);
    expect(session.body).toBeNull();
  });
});
