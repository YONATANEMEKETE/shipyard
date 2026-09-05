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

// Force the trail recorder to fail (rule 4: recording never fails the read).
const { recordViewMock } = vi.hoisted(() => ({
  recordViewMock: vi.fn<() => Promise<void>>(),
}));

vi.mock(
  '../../../../src/features/dashboard/repository.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/features/dashboard/repository.js')
      >();
    return {
      ...actual,
      dashboardRepository: {
        ...actual.dashboardRepository,
        recordView: recordViewMock,
      },
    };
  },
);

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import { env } from '../../../../src/common/config/env.js';

const WEB_URL = env.WEB_URL;
const PASSWORD = 'sup3r-secret-pass';
type Request = ReturnType<typeof createTestApp>;

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}
function dataOf<T>(res: { body: unknown }): T {
  return bodyOf<{ data: T }>(res).data;
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
): Promise<{ cookies: string; userId: string }> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Test User', email, password: PASSWORD });

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

interface WsResp {
  id: string;
  slug: string;
}

interface DashboardPayload {
  myWork: { recentlyViewed: unknown[] };
}

const DASH = (slug: string) => `/api/v1/workspaces/${slug}/dashboard`;

describe('trail recording is best-effort (integration)', () => {
  const uniqueEmail = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.com`;

  let request: Request;
  let owner: { cookies: string; userId: string };
  let ws: WsResp;

  beforeEach(async () => {
    await resetDatabase();
    request = createTestApp();
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ status: 'logged' });
    recordViewMock.mockReset();
    recordViewMock.mockResolvedValue(undefined);

    owner = {
      ...(await registerVerifiedUser(request, uniqueEmail('owner'))),
    };

    const wres = await request
      .post('/api/v1/workspaces')
      .set('Cookie', owner.cookies)
      .send({ name: 'Shipyard Team' });
    expect(wres.status).toBe(201);
    ws = dataOf<WsResp>(wres);
  });

  it('a failing recorder never fails the detail read (rule 4)', async () => {
    const res = await request
      .post(`/api/v1/workspaces/${ws.slug}/issues`)
      .set('Cookie', owner.cookies)
      .send({ title: 'Recorded read' });
    const issue = dataOf<{ id: string }>(res);

    recordViewMock.mockRejectedValueOnce(new Error('recorder down'));

    const detail = await request
      .get(`/api/v1/workspaces/${ws.slug}/issues/${issue.id}`)
      .set('Cookie', owner.cookies);
    expect(detail.status).toBe(200);
    expect(dataOf<{ title: string }>(detail).title).toBe('Recorded read');

    // Nothing was persisted, and the hub is unaffected.
    expect(
      await prisma.issueView.count({
        where: { userId: owner.userId, workspaceId: ws.id },
      }),
    ).toBe(0);
    const dash = await request.get(DASH(ws.slug)).set('Cookie', owner.cookies);
    expect(dash.status).toBe(200);
    expect(dataOf<DashboardPayload>(dash).myWork.recentlyViewed).toEqual([]);
  });
});
