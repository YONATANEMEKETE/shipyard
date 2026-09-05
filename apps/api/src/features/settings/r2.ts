import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AvatarMime } from '@shipyard/shared';
import { env } from '../../common/config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Avatar object storage (settings F11, data-model §2.2).
//
// Public-read bucket + unguessable keys are the access control (D2) — uploads
// and deletes are strictly server-side through this adapter. The DB stores the
// object KEY (not the URL); `resolveImageUrl` in common/storage joins the
// public base at read time so a custom-domain swap is an env change, never a
// data migration.
//
// Tests inject the in-memory fake via createApp({ avatarStorage }) — no
// emulator, no network (data-model §8).
// ─────────────────────────────────────────────────────────────────────────────

// Cache header shared by prod and fake so tests assert the real posture:
// new key per upload ⇒ immutable caching is safe.
export const AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// ── Key convention: avatars/:userId/:uuid.:ext (D2) ──

// Ext derived from the validated MIME — jpeg collapses to jpg (one canonical
// ext per type, matching the D3 allowlist order).
const MIME_EXTENSIONS: Record<AvatarMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function buildAvatarKey(userId: string, mime: AvatarMime): string {
  // 128-bit random UUID — unguessability is the whole access model.
  return `avatars/${userId}/${randomUUID()}.${MIME_EXTENSIONS[mime]}`;
}

// ── Adapter interface ──

export interface AvatarObjectMeta {
  contentType: string;
  cacheControl: string;
}

export interface AvatarStorage {
  put(key: string, body: Uint8Array, meta: AvatarObjectMeta): Promise<void>;
  delete(key: string): Promise<void>;
}

// ── Production implementation — S3 API against R2 (S3-compatible) ──

export class R2AvatarStorage implements AvatarStorage {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      // R2 speaks path-style, not virtual-host style.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(
    key: string,
    body: Uint8Array,
    meta: AvatarObjectMeta,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.R2_PUBLIC_BUCKET,
        Key: key,
        Body: body,
        ContentType: meta.contentType,
        CacheControl: meta.cacheControl,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_PUBLIC_BUCKET,
        Key: key,
      }),
    );
  }
}

// ── In-memory fake — tests/dev-optional (data-model §8) ──

export interface StoredAvatarObject extends AvatarObjectMeta {
  bytes: Buffer;
}

export class InMemoryAvatarStorage implements AvatarStorage {
  readonly objects = new Map<string, StoredAvatarObject>();

  /** Rejects the next put() once, then clears (one-shot failure). */
  failNextPut: Error | null = null;
  /** Rejects every put() until cleared (sustained R2-outage simulation). */
  putOutage: Error | null = null;
  /** Rejects the next delete() once, then clears (D4 cleanup-failure path). */
  failNextDelete: Error | null = null;

  has(key: string): boolean {
    return this.objects.has(key);
  }

  get(key: string): StoredAvatarObject | undefined {
    return this.objects.get(key);
  }

  put(key: string, body: Uint8Array, meta: AvatarObjectMeta): Promise<void> {
    if (this.putOutage) return Promise.reject(this.putOutage);
    if (this.failNextPut) {
      const error = this.failNextPut;
      this.failNextPut = null;
      return Promise.reject(error);
    }
    this.objects.set(key, {
      bytes: Buffer.from(body),
      contentType: meta.contentType,
      cacheControl: meta.cacheControl,
    });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    if (this.failNextDelete) {
      const error = this.failNextDelete;
      this.failNextDelete = null;
      return Promise.reject(error);
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}

// ── Active adapter (set by createApp; read by the settings service) ──
// Lazy: the prod client is only constructed on first use — importing this
// module in tests (where the fake is injected via createApp) never builds an
// S3Client.

let activeStorage: AvatarStorage | null = null;

export function setAvatarStorage(storage: AvatarStorage): void {
  activeStorage = storage;
}

export function getAvatarStorage(): AvatarStorage {
  return (activeStorage ??= defaultAvatarStorage());
}

export function defaultAvatarStorage(): AvatarStorage {
  return new R2AvatarStorage();
}
