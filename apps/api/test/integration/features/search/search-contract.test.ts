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
import { prisma } from '../../../../src/common/db/client.js';
import { env } from '../../../../src/common/config/env.js';
import {
  seedBulkIssues,
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
function dataOf<T>(res: { body: unknown }): T {
  return bodyOf<{ data: T }>(res).data;
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

// ── Response shapes (client-side view of the shared contracts) ───────────

interface SearchResponse {
  q: string;
  issues: {
    id: string;
    workspaceId: string;
    seqNumber: number;
    identifier: string;
    title: string;
    labels: { id: string; name: string }[];
    assignee: { userId: string } | null;
  }[];
  projects: {
    id: string;
    name: string;
    owner: { userId: string; name: string };
  }[];
  cycles: {
    id: string;
    name: string;
    progress: { total: number; completed: number; percent: number | null };
  }[];
  members: {
    id: string;
    userId: string;
    name: string;
    role: string;
  }[];
  comments: {
    id: string;
    issueId: string;
    issueIdentifier: string;
    issueTitle: string;
    content: string;
    mentions: { userId: string }[];
  }[];
}

describe('search contract (integration)', () => {
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

    // The mention-carrying comment goes through the API so mention
    // resolution runs — its hit renders mention cards.
    const maya = await prisma.user.findUnique({
      where: { id: corpus.mayaUserId },
    });
    const res = await request
      .post(
        `/api/v1/workspaces/${corpus.slug}/issues/${corpus.issueHitId}/comments`,
      )
      .set('Cookie', owner.cookies)
      .send({
        content: `@${(maya?.name ?? 'maya').split(' ')[0]!.toLowerCase()} checkout decided`,
      });
    expect(res.status).toBe(201);
    corpus.commentHitId = (res.body as { data: { id: string } }).data.id;
  });

  it('returns the grouped, bounded result shape (200 + q echo)', async () => {
    const res = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'checkout' })
      .set('Cookie', owner.cookies);

    expect(res.status).toBe(200);
    const results = dataOf<SearchResponse>(res);
    expect(results.q).toBe('checkout');

    // Issue hit: owning card shape with identifier + inline labels.
    expect(results.issues.length).toBeGreaterThanOrEqual(1);
    const titleHit = results.issues.find((i) => i.id === corpus.issueHitId);
    expect(titleHit).toBeTruthy();
    expect(titleHit!.identifier).toBe('SHIP-24');
    expect(titleHit!.workspaceId).toBe(corpus.workspaceId);
    expect(Array.isArray(titleHit!.labels)).toBe(true);
    expect(titleHit!.assignee).toBeNull();

    // Project hit: owner card joined through the workspace membership.
    expect(results.projects.map((p) => p.id)).toContain(corpus.projectHitId);
    expect(results.projects[0]!.owner.userId).toBe(owner.userId);

    // Cycle hit: derived progress ships inline.
    expect(results.cycles.map((c) => c.id)).toContain(corpus.cycleHitId);
    expect(results.cycles[0]!.progress).toEqual({
      total: 0,
      completed: 0,
      percent: null,
    });

    // Member hits render cards (name match, not involved in this query).
    // Comment hit: card + issue context for the permalink target.
    const commentHit = results.comments.find(
      (c) => c.id === corpus.commentHitId,
    );
    expect(commentHit).toBeTruthy();
    expect(commentHit!.issueIdentifier).toBe('SHIP-24');
    expect(commentHit!.issueTitle).toBe('Fix checkout redirect');
    expect(commentHit!.issueId).toBe(corpus.issueHitId);
    expect(commentHit!.mentions.length).toBe(1);
    expect(commentHit!.mentions[0]!.userId).toBe(corpus.mayaUserId);
  });

  it('missing q key is 400 VALIDATION_ERROR', async () => {
    const res = await request
      .get(searchUrl(corpus.slug))
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('blank-but-present q is 200 with empty groups (never an error, never a dump)', async () => {
    for (const blank of ['%20%20', '%09']) {
      const res = await request
        .get(searchUrl(corpus.slug))
        .query({ q: decodeURIComponent(blank) })
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(200);
      const results = dataOf<SearchResponse>(res);
      expect(results.q).toBe('');
      expect(results.issues).toEqual([]);
      expect(results.projects).toEqual([]);
      expect(results.cycles).toEqual([]);
      expect(results.members).toEqual([]);
      expect(results.comments).toEqual([]);
    }
  });

  it('q over 200 chars after trim is 400', async () => {
    const res = await request
      .get(searchUrl(corpus.slug))
      .query({ q: `  ${'x'.repeat(201)}  ` })
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('unknown type and out-of-range limit are 400', async () => {
    for (const query of [
      { q: 'x', type: 'workspace' },
      { q: 'x', type: '' },
      { q: 'x', limit: '0' },
      { q: 'x', limit: '51' },
      { q: 'x', limit: 'abc' },
    ]) {
      const res = await request
        .get(searchUrl(corpus.slug))
        .query(query)
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(400);
      expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    }
  });

  it('unauthenticated request is 401', async () => {
    const res = await request.get(searchUrl(corpus.slug)).query({ q: 'x' });
    expect(res.status).toBe(401);
    expect(errorCodeOf(res)).toBe('UNAUTHORIZED');
  });

  it('non-member and unknown slug get the identical 404 (no existence leak)', async () => {
    const outsider = await registerVerifiedUser(
      createTestApp(),
      uniqueEmail('outsider'),
    );

    const memberRes = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'checkout' })
      .set('Cookie', outsider.cookies);
    const unknownRes = await request
      .get(searchUrl(`no-such-ws-${crypto.randomUUID()}`))
      .query({ q: 'checkout' })
      .set('Cookie', outsider.cookies);

    expect(memberRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    expect(errorCodeOf(memberRes)).toBe('WORKSPACE_NOT_FOUND');
    expect(errorCodeOf(unknownRes)).toBe('WORKSPACE_NOT_FOUND');
    // Identical modulo the per-request id — a non-member and a bogus slug
    // are indistinguishable.
    const stripRequestId = (value: unknown) => {
      const body = value as { error: { requestId?: string } };
      return JSON.stringify({
        ...body,
        error: { ...body.error, requestId: '' },
      });
    };
    expect(stripRequestId(memberRes.body)).toBe(
      stripRequestId(unknownRes.body),
    );
  });

  it('bounds: 20 default, 50 when type filters, explicit limit wins', async () => {
    await seedBulkIssues(corpus.workspaceId, owner.userId, 25);

    const def = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'padding number' })
      .set('Cookie', owner.cookies);
    expect(dataOf<SearchResponse>(def).issues).toHaveLength(20);

    const typed = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'padding number', type: 'issues' })
      .set('Cookie', owner.cookies);
    const typedResults = dataOf<SearchResponse>(typed);
    expect(typedResults.issues).toHaveLength(25); // all seeds; bound is 50
    expect(typedResults.projects).toEqual([]);
    expect(typedResults.cycles).toEqual([]);
    expect(typedResults.members).toEqual([]);
    expect(typedResults.comments).toEqual([]);

    const limited = await request
      .get(searchUrl(corpus.slug))
      .query({ q: 'padding number', limit: '5' })
      .set('Cookie', owner.cookies);
    expect(dataOf<SearchResponse>(limited).issues).toHaveLength(5);
  });

  it('type filter isolates its group for every searchable type', async () => {
    for (const [type, id] of [
      ['projects', corpus.projectHitId],
      ['cycles', corpus.cycleHitId],
      ['members', corpus.mayaMemberId],
      ['comments', corpus.commentHitId],
    ] as const) {
      const res = await request
        .get(searchUrl(corpus.slug))
        .query({ q: type === 'members' ? 'maya' : 'checkout', type })
        .set('Cookie', owner.cookies);
      expect(res.status).toBe(200);
      const results = dataOf<SearchResponse>(res);
      const populated = results[type];
      expect(populated.map((item) => (item as { id: string }).id)).toContain(
        id,
      );
      // Every other group stays empty.
      for (const other of [
        'issues',
        'projects',
        'cycles',
        'members',
        'comments',
      ] as const) {
        if (other === type) continue;
        expect(results[other]).toEqual([]);
      }
    }
  });
});
