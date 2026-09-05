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

interface SearchResponse {
  q: string;
  issues: { id: string }[];
  projects: { id: string }[];
  cycles: { id: string }[];
  members: { id: string; name: string }[];
  comments: { id: string }[];
}

describe('search visibility (integration)', () => {
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

  async function search(query: Record<string, string>) {
    const res = await request
      .get(searchUrl(corpus.slug))
      .query(query)
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(200);
    return dataOf<SearchResponse>(res);
  }

  // ── Archived exclusion (rule 3, D6) ───────────────────────────────────

  it('archived entities are excluded from every group', async () => {
    // Seed an archived project + cycle alongside the corpus's archived issue
    // and its comment.
    const now = new Date();
    const suffix = crypto.randomUUID().slice(0, 8);
    await prisma.project.create({
      data: {
        id: `sm-arch-project-${suffix}`,
        workspaceId: corpus.workspaceId,
        name: 'Archived checkout project',
        ownerId: corpus.ownerUserId,
        archivedAt: now,
        updatedAt: now,
      },
    });
    await prisma.cycle.create({
      data: {
        id: `sm-arch-cycle-${suffix}`,
        workspaceId: corpus.workspaceId,
        name: 'Archived checkout cycle',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-14'),
        archivedAt: now,
        updatedAt: now,
      },
    });

    const results = await search({ q: 'checkout' });
    expect(results.issues.map((i) => i.id)).not.toContain(
      corpus.issueArchivedId,
    );
    expect(results.projects.map((p) => p.id)).not.toContain(
      `sm-arch-project-${suffix}`,
    );
    expect(results.cycles.map((c) => c.id)).not.toContain(
      `sm-arch-cycle-${suffix}`,
    );
    // Comment on an archived issue is excluded via the issue-join gate.
    expect(results.comments.map((c) => c.id)).not.toContain(
      corpus.commentArchivedId,
    );
    // The active rows still hit.
    expect(results.issues.map((i) => i.id)).toContain(corpus.issueHitId);
  });

  // ── Workspace scoping (rule 1 — absolute) ─────────────────────────────

  it('cross-workspace content never surfaces, per leg', async () => {
    const results = await search({ q: 'checkout' });
    const ids = [
      ...results.issues.map((i) => i.id),
      ...results.projects.map((p) => p.id),
      ...results.cycles.map((c) => c.id),
      ...results.comments.map((c) => c.id),
    ];
    expect(ids).not.toContain(corpus.otherIssueId);
    // And every hit really belongs to the active workspace.
    const foreign = ids.filter(
      (id) => id === corpus.otherIssueId || id.includes('other'),
    );
    expect(foreign).toEqual([]);
  });

  it('a non-member of the other workspace gets the generic 404 on its slug', async () => {
    // The owner is not a member of the second workspace — same generic 404
    // as a bogus slug (no existence leak).
    const res = await request
      .get(searchUrl(corpus.otherSlug))
      .query({ q: 'checkout' })
      .set('Cookie', owner.cookies);
    expect(res.status).toBe(404);
    expect(errorCodeOf(res)).toBe('WORKSPACE_NOT_FOUND');
  });

  // ── Member visibility (D5 — name only) ────────────────────────────────

  it('member hits match by name; email prefixes never match', async () => {
    const byName = await search({ q: 'maya' });
    expect(byName.members.map((m) => m.name)).toContain('Maya Chen');

    // Email-prefix-only query matches nothing extra — email is never a
    // predicate (D5, superseding the F3 line).
    const byEmail = await search({ q: 'maya-' });
    expect(byEmail.members).toEqual([]);
  });

  it('departed members disappear from results', async () => {
    await prisma.workspaceMember.delete({
      where: { id: corpus.mayaMemberId },
    });
    const results = await search({ q: 'maya' });
    expect(results.members).toEqual([]);
  });

  // ── Archived workspace tolerance (§6 matrix) ──────────────────────────

  it('an archived workspace stays searchable over its non-archived entities', async () => {
    await prisma.workspace.update({
      where: { id: corpus.workspaceId },
      data: { status: 'ARCHIVED' },
    });
    const results = await search({ q: 'checkout' });
    expect(results.issues.map((i) => i.id)).toContain(corpus.issueHitId);
    expect(results.projects.map((p) => p.id)).toContain(corpus.projectHitId);
  });
});
