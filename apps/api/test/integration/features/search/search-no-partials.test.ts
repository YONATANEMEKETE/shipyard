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

// Leg-failure injection: the projects leg rejects after the guard chain —
// proof the fan-out never returns partial groups (api-design §7/§8.1).
vi.mock(
  '../../../../src/features/search/repository.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/features/search/repository.js')
      >();
    return {
      ...actual,
      rankedProjectIds: vi
        .fn()
        .mockRejectedValue(new Error('injected leg failure')),
    };
  },
);

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';
import {
  seedSearchCorpus,
  searchUrl,
  type CorpusIds,
} from '../../../helpers/search.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';
type Request = ReturnType<typeof createTestApp>;

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}
function errorCodeOf(res: { body: unknown }): string {
  return bodyOf<{ error: { code: string } }>(res).error.code;
}

function cookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw: unknown = res.headers['set-cookie'];
  const list: string[] =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string')
        : [];
  return list.map((c) => c.split(';')[0] ?? '').join('; ');
}

async function registerVerifiedUser(
  request: Request,
  email: string,
  name = 'Test User',
): Promise<{ cookies: string; userId: string }> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name, email, password: PASSWORD });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const last = sendEmailMock.mock.calls.at(-1)![0] as unknown as CapturedEmail;
  const linkMatch = /https?:\/\/\S+/u.exec(last.text ?? last.html);
  const token = new URL(linkMatch![0]).searchParams.get('token');
  expect(token).toBeTruthy();

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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return { cookies: cookies!, userId: userId! };
}

describe('search no-partials (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string };
  let corpus: CorpusIds;

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });

    owner = await registerVerifiedUser(request, uniqueEmail('owner'));
    corpus = await seedSearchCorpus(owner.userId);
  });

  it('a failing leg is a 500 error envelope — never partial groups', async () => {
    const res = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'checkout' })
      .set('Cookie', owner.cookies);

    expect(res.status).toBe(500);
    expect(errorCodeOf(res)).toBe('INTERNAL_SERVER_ERROR');
    // The body is the error envelope only — no partial `data` with three
    // populated groups and a missing one.
    expect(res.body).not.toHaveProperty('data');
  });

  it('the failure applies to the single-group surface too', async () => {
    // Without the type filter the failing projects leg participates in the
    // fan-out; with ?type=projects it is the only leg — both must fail hard
    // rather than return anything partial.
    const res = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'checkout', type: 'projects' })
      .set('Cookie', owner.cookies);

    expect(res.status).toBe(500);
    expect(errorCodeOf(res)).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body).not.toHaveProperty('data');
  });
});
