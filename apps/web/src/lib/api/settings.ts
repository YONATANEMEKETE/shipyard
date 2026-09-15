import type {
  Appearance,
  AvatarCard,
  ProfileCard,
  SetAppearanceRequest,
  UpdateProfileRequest,
} from '@shipyard/shared';
import { AVATAR_FILE_FIELD } from '@shipyard/shared';

import { requestForm, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Settings API client — account-scoped, no workspace anywhere in the path.
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes: success
// { data }, error { error: { code, message, ... } }.
//
// Route table mirrors the API exactly (api-design §2.1) — six endpoints, and
// every one of them is reachable with zero workspaces. Delegated sections
// (password, email) have no endpoint here on purpose: they are client links
// into Auth, never proxy calls.
// ─────────────────────────────────────────────────────────────────────────────

export class SettingsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'SettingsApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

const SETTINGS_BASE = '/api/v1/settings';

// ── Profile (#1, #2) ──

export function getProfile(): Promise<ProfileCard> {
  return requestJson<ProfileCard>(
    `${SETTINGS_BASE}/profile`,
    { method: 'GET' },
    'Failed to load your profile',
    SettingsApiError,
  );
}

/** Rename only. An `email` key is a 400 by contract — Auth owns identity. */
export function updateProfile(
  body: UpdateProfileRequest,
): Promise<ProfileCard> {
  return requestJson<ProfileCard>(
    `${SETTINGS_BASE}/profile`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to save your profile',
    SettingsApiError,
  );
}

// ── Appearance (#3, #4) ──

export function getAppearance(): Promise<Appearance> {
  return requestJson<Appearance>(
    `${SETTINGS_BASE}/appearance`,
    { method: 'GET' },
    'Failed to load your appearance settings',
    SettingsApiError,
  );
}

export function setAppearance(body: SetAppearanceRequest): Promise<Appearance> {
  return requestJson<Appearance>(
    `${SETTINGS_BASE}/appearance`,
    { method: 'PUT', body: JSON.stringify(body) },
    'Failed to save your theme',
    SettingsApiError,
  );
}

// ── Avatar (#5, #6) ──

/**
 * Upload/replace — replies 201 with the new public URL.
 *
 * The 2MB cap and the MIME/extension gates are not duplicated here: multer
 * aborts the stream at the cap before buffering, so an oversized pick is
 * rejected server-side without cost. The picker's client-side mirror of
 * `AVATAR_MAX_BYTES` belongs to the avatar flow, not to the transport.
 */
export function uploadAvatar(file: File): Promise<AvatarCard> {
  const form = new FormData();
  form.append(AVATAR_FILE_FIELD, file);

  return requestForm<AvatarCard>(
    `${SETTINGS_BASE}/avatar`,
    form,
    'Failed to upload your photo',
    SettingsApiError,
  );
}

/** Clear — the `{ confirm: true }` literal is enforced in the API service. */
export function clearAvatar(): Promise<ProfileCard> {
  return requestJson<ProfileCard>(
    `${SETTINGS_BASE}/avatar`,
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to remove your photo',
    SettingsApiError,
  );
}
