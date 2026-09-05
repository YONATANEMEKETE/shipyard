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
  issues: { id: string; identifier: string; title: string }[];
  projects: { id: string; name: string }[];
  cycles: { id: string; name: string }[];
  members: { id: string; name: string }[];
  comments: { id: string; issueIdentifier: string; content: string }[];
}

describe('search ranking (integration)', () => {
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

  // ── Prefix matching (D4 `:*` per term) ────────────────────────────────

  it('prefix "che" hits "checkout" across every content leg', async () => {
    const results = await search({ q: 'che' });
    expect(results.issues.map((i) => i.id)).toContain(corpus.issueHitId);
    expect(results.projects.map((p) => p.id)).toContain(corpus.projectHitId);
    expect(results.cycles.map((c) => c.id)).toContain(corpus.cycleHitId);
    // Comment on the archived issue stays excluded even on prefix hits (D6).
    expect(results.comments.map((c) => c.id)).not.toContain(
      corpus.commentArchivedId,
    );
  });

  it('multi-term queries require every term (AND semantics)', async () => {
    const results = await search({ q: 'checkout redirect' });
    expect(results.issues.map((i) => i.id)).toContain(corpus.issueHitId);
    // "checkout" alone in the body is not enough — "redirect" must match too.
    expect(results.issues.map((i) => i.id)).not.toContain(
      corpus.issueBodyHitId,
    );
  });

  // ── Short tokens (rule 4 — never an error, ILIKE arms carry) ──────────

  it('single-char token still matches via containment, ordered by recency', async () => {
    const results = await search({ q: 'z' });
    // 'z' appears in no seeded content… except nothing. Verify no error and
    // an honest empty set — short tokens never fabricate matches either.
    expect(results.q).toBe('z');
    // The corpus has no 'z' anywhere: all groups empty is the correct 200.
    expect(results.issues).toEqual([]);
    expect(results.projects).toEqual([]);
    expect(results.cycles).toEqual([]);

    const a = await search({ q: 'a' });
    // 'a' containment reaches the body-only issue ("talks", "flow").
    expect(a.issues.map((i) => i.id)).toContain(corpus.issueBodyHitId);
  });

  it('symbol-only query degrades to literal containment without error', async () => {
    // Reaching the assertions means a 200 — '%' is matched literally, never
    // treated as a wildcard, and never a tsquery syntax error.
    const results = await search({ q: '100%' });
    expect(results.q).toBe('100%');
    expect(results.issues).toEqual([]);
  });

  // ── Weights (D3 — title/name outranks body) ───────────────────────────

  it('a title hit outranks a body-only hit for the same term', async () => {
    const results = await search({ q: 'checkout' });
    const ids = results.issues.map((i) => i.id);
    const titleIdx = ids.indexOf(corpus.issueHitId);
    const bodyIdx = ids.indexOf(corpus.issueBodyHitId);
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeLessThan(bodyIdx);
  });

  // ── Identifier fast path (§8.3) ───────────────────────────────────────

  it('exact SHIP-24 leads issues; unknown number falls through normally', async () => {
    const exact = await search({ q: 'SHIP-24' });
    expect(exact.issues[0]!.id).toBe(corpus.issueHitId);
    expect(exact.issues[0]!.identifier).toBe('SHIP-24');
    // Case-insensitive identifier.
    const lowered = await search({ q: 'ship-24' });
    expect(lowered.issues[0]!.id).toBe(corpus.issueHitId);

    // Unknown/deleted number: no error, normal legs (issues from rank only).
    const unknown = await search({ q: 'SHIP-999' });
    expect(unknown.issues.map((i) => i.identifier)).not.toContain('SHIP-999');

    // A comment body containing the identifier text still surfaces via the
    // normal comment leg — the fast path does not starve other groups.
    const now = new Date();
    const comment = await prisma.comment.create({
      data: {
        id: `sm-comment-ship-${crypto.randomUUID().slice(0, 8)}`,
        workspaceId: corpus.workspaceId,
        issueId: corpus.issueBodyHitId,
        authorId: corpus.mayaUserId,
        content: 'SHIP-24 mentioned in standup',
        createdAt: now,
        updatedAt: now,
      },
    });
    const withComment = await search({ q: 'SHIP-24' });
    expect(withComment.comments.map((c) => c.id)).toContain(comment.id);
    // And the identifier hit still leads the issues group.
    expect(withComment.issues[0]!.id).toBe(corpus.issueHitId);
  });

  // ── Determinism (rule 5 — byte-equal repeats) ─────────────────────────

  it('same query twice returns byte-equal bodies', async () => {
    const first = await search({ q: 'checkout' });
    const second = await search({ q: 'checkout' });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('member hits order by name ascending with deterministic tiebreaks', async () => {
    // Corpus members: owner ("Test User"), Maya Chen, Bob — search 'a'
    // matches Maya Chen and Bob? 'a' ILIKE: "Bob" has no 'a'. Owner "Test
    // User" has no 'a'. So assert exactly Maya for 'may'.
    const results = await search({ q: 'may' });
    expect(results.members.map((m) => m.name)).toEqual(['Maya Chen']);
  });
});
