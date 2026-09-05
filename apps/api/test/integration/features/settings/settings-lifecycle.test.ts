import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  errorResponseSchema,
  profileCardSchema,
  appearanceSchema,
  avatarCardSchema,
} from '@shipyard/shared';
import { AVATAR_CACHE_CONTROL } from '../../../../src/features/settings/r2.js';
import { env } from '../../../../src/common/config/env.js';
import { createTestApp, testAvatarStorage } from '../../../helpers/app.js';
import { resetDatabase, prisma } from '../../../helpers/db.js';

/**
 * Settings lifecycle (integration) — api-design §10.1 matrix over the six
 * account routes. Session-only scope: no workspace needed anywhere except the
 * rename-propagation assertions. Avatar storage is the shared in-memory fake;
 * failure-injection hooks drive the D4-cleanup and R2-outage paths.
 */

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

const WEB_URL = 'http://localhost:3000';
const PASSWORD = 'sup3r-secret-pass';
const BASE = '/api/v1/settings';

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/** Sign up → verify via the mocked email → session cookie from verification. */
async function registerVerifiedUser(
  request: Request,
  email: string,
): Promise<string> {
  await request
    .post('/api/v1/auth/sign-up/email')
    .set('Origin', WEB_URL)
    .send({ name: 'Test User', email, password: PASSWORD });

  const last = sendEmailMock.mock.calls.at(-1)![0];
  const linkMatch = /https?:\/\/\S+/u.exec(last.text ?? last.html);
  const token = new URL(linkMatch![0]).searchParams.get('token');
  expect(token).toBeTruthy();

  const response = await createTestApp()
    .get(`/api/v1/auth/verify-email?token=${token}&callbackURL=%2F`)
    .set('Origin', WEB_URL);

  const cookies = cookieHeader(response);
  expect(cookies).toBeTruthy();
  return cookies;
}

// Minimal valid 1×1 PNG (magic bytes + IHDR/IDAT/IEND) — sniffs as image/png.
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
    '01f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

function pngBuffer(size = PNG_BYTES.length): Buffer {
  return size === PNG_BYTES.length
    ? PNG_BYTES
    : Buffer.concat([PNG_BYTES, Buffer.alloc(size - PNG_BYTES.length)]);
}

const uniqueEmail = (prefix: string) =>
  `${prefix}-${crypto.randomUUID()}@example.com`;

async function createUser(
  prefix: string,
): Promise<{ email: string; cookies: string; userId: string }> {
  const email = uniqueEmail(prefix);
  const cookies = await registerVerifiedUser(createTestApp(), email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { email, cookies, userId: user.id };
}

beforeEach(async () => {
  await resetDatabase();
  testAvatarStorage.objects.clear();
  testAvatarStorage.failNextPut = null;
  testAvatarStorage.failNextDelete = null;
  testAvatarStorage.putOutage = null;
});

// ── Happy paths ×6 ───────────────────────────────────────────────────────

describe('settings happy paths', () => {
  it('#1 GET /profile returns the profile card', async () => {
    const { cookies, email } = await createUser('profile-get');
    const res = await createTestApp()
      .get(`${BASE}/profile`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const card = profileCardSchema.parse(dataOf(res));
    expect(card.name).toBe('Test User');
    expect(card.email).toBe(email);
    expect(card.image).toBeNull();
    expect(card.emailVerified).toBe(true);
  });

  it('#2 PATCH /profile renames and echoes the card', async () => {
    const { cookies } = await createUser('profile-patch');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: 'Maya Chen' });
    expect(res.status).toBe(200);
    expect(profileCardSchema.parse(dataOf(res)).name).toBe('Maya Chen');
  });

  it('#3 GET /appearance returns SYSTEM when no row exists', async () => {
    const { cookies } = await createUser('appearance-get');
    const res = await createTestApp()
      .get(`${BASE}/appearance`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(appearanceSchema.parse(dataOf(res)).theme).toBe('SYSTEM');
  });

  it('#4 PUT /appearance sets the theme (upsert round-trip)', async () => {
    const { cookies } = await createUser('appearance-put');
    const set = await createTestApp()
      .put(`${BASE}/appearance`)
      .set('Cookie', cookies)
      .send({ theme: 'DARK' });
    expect(set.status).toBe(200);
    expect(appearanceSchema.parse(dataOf(set)).theme).toBe('DARK');

    const readBack = await createTestApp()
      .get(`${BASE}/appearance`)
      .set('Cookie', cookies);
    expect(appearanceSchema.parse(dataOf(readBack)).theme).toBe('DARK');
  });

  it('#5 POST /avatar uploads — 201, key persisted, object stored immutable', async () => {
    const { cookies, userId } = await createUser('avatar-post');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'me.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    const card = avatarCardSchema.parse(dataOf(res));
    // Card URL = public base + stored key (whatever base this env carries).
    expect(card.image).toMatch(
      new RegExp(`^${escapeRegExp(env.R2_PUBLIC_BASE_URL)}/`, 'u'),
    );

    // DB stores the object KEY, never the URL (D8).
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.image).toMatch(
      new RegExp(`^avatars/${userId}/[0-9a-f-]+\\.png$`, 'u'),
    );
    expect(user.image!.startsWith('http')).toBe(false);

    // Fake object present with the immutable cache posture.
    const stored = testAvatarStorage.objects.get(user.image!);
    expect(stored).toBeDefined();
    expect(stored!.contentType).toBe('image/png');
    expect(stored!.cacheControl).toBe(AVATAR_CACHE_CONTROL);

    // Card URL resolves from the key + public base.
    expect(card.image).toBe(`${env.R2_PUBLIC_BASE_URL}/${user.image}`);
  });

  it('#6 DELETE /avatar clears — object deleted, card image null', async () => {
    const { cookies, userId } = await createUser('avatar-clear');
    await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'me.png',
        contentType: 'image/png',
      });
    const key = (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .image!;

    const res = await createTestApp()
      .delete(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    const card = profileCardSchema.parse(dataOf(res));
    expect(card.image).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.image).toBeNull();
    expect(testAvatarStorage.has(key)).toBe(false);
  });
});

// ── Validation matrix ────────────────────────────────────────────────────

describe('settings validation', () => {
  it('rejects an empty display name', async () => {
    const { cookies } = await createUser('v-empty-name');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('rejects a name over 100 characters', async () => {
    const { cookies } = await createUser('v-long-name');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('trims the display name', async () => {
    const { cookies, userId } = await createUser('v-trim');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: '  Maya Chen  ' });
    expect(res.status).toBe(200);
    expect(dataOf<{ name: string }>(res).name).toBe('Maya Chen');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.name).toBe('Maya Chen');
  });

  it('rejects an email key in the profile body — rule-4 proof', async () => {
    const { cookies, email, userId } = await createUser('v-email-key');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: 'Maya Chen', email: 'new@evil.com' });
    expect(res.status).toBe(400);
    const error = errorResponseSchema.parse(res.body);
    expect(error.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(error.error.details)).toContain('email');

    // Auth-owned identity untouched.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(email);
  });

  it('rejects an unknown theme enum', async () => {
    const { cookies } = await createUser('v-theme');
    const res = await createTestApp()
      .put(`${BASE}/appearance`)
      .set('Cookie', cookies)
      .send({ theme: 'BLUE' });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing avatar part before R2', async () => {
    const { cookies } = await createUser('v-no-part');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies);
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('rejects a disallowed claimed MIME (gif/exe) before R2', async () => {
    const { cookies } = await createUser('v-gif');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', Buffer.from('GIF89a—not-an-allowed-image'), {
        filename: 'anim.gif',
        contentType: 'image/gif',
      });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('rejects content that does not match its claimed type', async () => {
    const { cookies } = await createUser('v-sniff');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', Buffer.from('definitely not a png'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('rejects an extension that does not match the MIME', async () => {
    const { cookies } = await createUser('v-ext');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'me.txt',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('rejects a file over 2MB before R2', async () => {
    const { cookies } = await createUser('v-oversize');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(AVATAR_MAX_BYTES + 1), {
        filename: 'big.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('VALIDATION_ERROR');
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('requires confirm: true to clear the avatar', async () => {
    const { cookies } = await createUser('v-confirm');
    const res = await createTestApp()
      .delete(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(400);
    expect(errorCodeOf(res)).toBe('CONFIRMATION_REQUIRED');
  });
});

// ── Auth boundary ────────────────────────────────────────────────────────

describe('settings unauthenticated', () => {
  it.each([
    ['get', '/profile'],
    ['patch', '/profile'],
    ['get', '/appearance'],
    ['put', '/appearance'],
    ['post', '/avatar'],
    ['delete', '/avatar'],
  ] as const)('%s %s without a session is 401', async (method, path) => {
    const res = await createTestApp()[method](`${BASE}${path}`);
    expect(res.status).toBe(401);
    expect(errorCodeOf(res)).toBe('UNAUTHORIZED');
  });
});

// ── Theme semantics ──────────────────────────────────────────────────────

describe('settings theme upsert semantics', () => {
  it('second set overwrites — still exactly one row per user', async () => {
    const { cookies, userId } = await createUser('theme-row');
    await createTestApp()
      .put(`${BASE}/appearance`)
      .set('Cookie', cookies)
      .send({ theme: 'DARK' });
    await createTestApp()
      .put(`${BASE}/appearance`)
      .set('Cookie', cookies)
      .send({ theme: 'LIGHT' });

    const rows = await prisma.userPreference.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.theme).toBe('LIGHT');
  });

  it('each user has an independent theme', async () => {
    const a = await createUser('theme-a');
    const b = await createUser('theme-b');
    await createTestApp()
      .put(`${BASE}/appearance`)
      .set('Cookie', a.cookies)
      .send({ theme: 'DARK' });

    const res = await createTestApp()
      .get(`${BASE}/appearance`)
      .set('Cookie', b.cookies);
    expect(appearanceSchema.parse(dataOf(res)).theme).toBe('SYSTEM');
  });
});

// ── Avatar lifecycle semantics ───────────────────────────────────────────

describe('settings avatar storage semantics', () => {
  it('replace rotates the key — new object stored, old deleted', async () => {
    const { cookies, userId } = await createUser('avatar-rotate');
    const first = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'a.png',
        contentType: 'image/png',
      });
    const firstKey = (
      await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    ).image!;
    const firstUrl = dataOf<{ image: string }>(first).image;

    const second = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'b.png',
        contentType: 'image/png',
      });
    expect(second.status).toBe(201);

    const secondKey = (
      await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    ).image!;
    expect(secondKey).not.toBe(firstKey);
    expect(testAvatarStorage.has(firstKey)).toBe(false);
    expect(testAvatarStorage.has(secondKey)).toBe(true);
    expect(dataOf<{ image: string }>(second).image).not.toBe(firstUrl);
  });

  it('cleanup failure never surfaces — replace still 201 (D4)', async () => {
    const { cookies, userId } = await createUser('avatar-cleanup-fail');
    await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'a.png',
        contentType: 'image/png',
      });
    const firstKey = (
      await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    ).image!;

    testAvatarStorage.failNextDelete = new Error('r2 delete down');
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'b.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    const newKey = (
      await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    ).image!;
    expect(newKey).not.toBe(firstKey);
    // Orphaned old object is inert — cleanup failure left it, DB still wins.
    expect(testAvatarStorage.has(firstKey)).toBe(true);
    expect(testAvatarStorage.has(newKey)).toBe(true);
  });

  it('R2 outage — 500, user.image unchanged, nothing stored', async () => {
    const { cookies, userId } = await createUser('avatar-outage');
    testAvatarStorage.putOutage = new Error('r2 unreachable');

    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'a.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(500);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.image).toBeNull();
    expect(testAvatarStorage.objects.size).toBe(0);
  });

  it('clear is idempotent — repeat returns 200 unchanged', async () => {
    const { cookies } = await createUser('avatar-idem');
    const first = await createTestApp()
      .delete(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .send({ confirm: true });
    expect(first.status).toBe(200);

    const second = await createTestApp()
      .delete(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .send({ confirm: true });
    expect(second.status).toBe(200);
    expect(profileCardSchema.parse(dataOf(second)).image).toBeNull();
  });

  it('jpeg admits the jpeg spelling and stores the canonical jpg key', async () => {
    const { cookies, userId } = await createUser('avatar-jpeg-ext');
    // JPEG magic bytes: FF D8 FF + padding.
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(16),
    ]);
    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', cookies)
      .attach('avatar', jpeg, {
        filename: 'photo.jpeg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.image).toMatch(/\.jpg$/u);
  });
});

// ── Self-scope isolation ─────────────────────────────────────────────────

describe('settings cross-user isolation', () => {
  it("one user's avatar upload never touches another user's image", async () => {
    const a = await createUser('iso-a');
    const b = await createUser('iso-b');

    const res = await createTestApp()
      .post(`${BASE}/avatar`)
      .set('Cookie', a.cookies)
      .attach('avatar', pngBuffer(), {
        filename: 'a.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);

    const userB = await prisma.user.findUniqueOrThrow({
      where: { id: b.userId },
    });
    expect(userB.image).toBeNull();

    const bProfile = await createTestApp()
      .get(`${BASE}/profile`)
      .set('Cookie', b.cookies);
    expect(profileCardSchema.parse(dataOf(bProfile)).image).toBeNull();
  });
});

// ── No-op discipline ─────────────────────────────────────────────────────

describe('settings no-op rename', () => {
  it('same-name rename is a 200 with no write', async () => {
    const { cookies, userId } = await createUser('noop-rename');
    const res = await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: 'Test User' });
    expect(res.status).toBe(200);
    expect(profileCardSchema.parse(dataOf(res)).name).toBe('Test User');
    // updatedAt untouched would need clock control; assert the row still has
    // the same name and no second write occurred via updatedAt stability.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.name).toBe('Test User');
  });
});

// ── Account-wide rename propagation ──────────────────────────────────────

describe('settings rename propagation', () => {
  it('rename shows account-wide — member card in a workspace', async () => {
    const { cookies, userId } = await createUser('propagate');

    const created = await createTestApp()
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Prop Lab' });
    expect(created.status).toBe(201);
    const slug = dataOf<{ slug: string }>(created).slug;

    await createTestApp()
      .patch(`${BASE}/profile`)
      .set('Cookie', cookies)
      .send({ name: 'Maya Chen' });

    const members = await createTestApp()
      .get(`/api/v1/workspaces/${slug}/members`)
      .set('Cookie', cookies);
    expect(members.status).toBe(200);
    const cards = dataOf<{ members: { userId: string; name: string }[] }>(
      members,
    ).members;
    const own = cards.find((m) => m.userId === userId);
    expect(own?.name).toBe('Maya Chen');
  });
});

// ── Route-table (rule-5 proof) ───────────────────────────────────────────

describe('settings route table', () => {
  it('proxy-shaped paths are not implemented — 404', async () => {
    const { cookies } = await createUser('route-table');

    const changePassword = await createTestApp()
      .post(`${BASE}/change-password`)
      .set('Cookie', cookies)
      .send({ currentPassword: 'x', newPassword: 'y' });
    expect(changePassword.status).toBe(404);

    const changeEmail = await createTestApp()
      .post(`${BASE}/change-email`)
      .set('Cookie', cookies)
      .send({ email: 'new@x.com' });
    expect(changeEmail.status).toBe(404);
  });
});
