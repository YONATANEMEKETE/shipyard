import type {
  CreateCycleRequest,
  CycleCard,
  CycleDetail,
  CycleStatus,
  DeleteCycleResponse,
  UpdateCycleRequest,
} from '@shipyard/shared';

import { confirmRequest, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Cycles API client — workspace-scoped time-boxed iterations (F7)
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes: success
// { data }, error { error: { code, message, ... } }.
// Mirrors apps/api/src/features/cycles/routes.ts and shared contracts in
// packages/shared/src/cycles.
//
// Lifecycle is action-only (#5–#9): there is deliberately no status write, so
// each transition gets a named function and every one is a confirmed action
// (`{ confirm: true }`). Issue↔cycle assignment is an issues-side write — it
// lives on the issues client, not here (api-design §5.2).
// ─────────────────────────────────────────────────────────────────────────────

export class CyclesApiError extends Error {
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
    this.name = 'CyclesApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function cyclesBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/cycles`;
}

function cycleItem(slug: string, cycleId: string): string {
  return `${cyclesBase(slug)}/${encodeURIComponent(cycleId)}`;
}

// ── Cycles — collection / item ────────────────────────────────────────────

export interface ListCyclesResponse {
  cycles: CycleCard[];
}

export interface ListCyclesParams {
  status?: CycleStatus;
  archived?: 'true' | 'false';
  sort?: 'createdAt' | 'name' | 'startDate' | 'endDate' | 'status';
  order?: 'asc' | 'desc';
}

export function listCycles(
  slug: string,
  params?: ListCyclesParams,
): Promise<ListCyclesResponse> {
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
          if (v !== undefined && v !== null && v !== '') acc[k] = String(v);
          return acc;
        }, {}),
      ).toString()}`
    : '';
  const suffix = query === '?' ? '' : query;
  return requestJson<ListCyclesResponse>(
    `${cyclesBase(slug)}${suffix}`,
    { method: 'GET' },
    'Failed to load cycles',
    CyclesApiError,
  );
}

export function getCycle(slug: string, cycleId: string): Promise<CycleDetail> {
  return requestJson<CycleDetail>(
    cycleItem(slug, cycleId),
    { method: 'GET' },
    'Failed to load cycle',
    CyclesApiError,
  );
}

export function createCycle(
  slug: string,
  body: CreateCycleRequest,
): Promise<CycleDetail> {
  return requestJson<CycleDetail>(
    cyclesBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create cycle',
    CyclesApiError,
  );
}

export function updateCycle(
  slug: string,
  cycleId: string,
  body: UpdateCycleRequest,
): Promise<CycleDetail> {
  return requestJson<CycleDetail>(
    cycleItem(slug, cycleId),
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update cycle',
    CyclesApiError,
  );
}

// ── Lifecycle actions (#5–#9) — confirmed named transitions ───────────────
// Each returns the updated detail so callers never have to re-read.

export function startCycle(
  slug: string,
  cycleId: string,
): Promise<CycleDetail> {
  return confirmRequest<CycleDetail>(
    `${cycleItem(slug, cycleId)}/start`,
    'Failed to start cycle',
    CyclesApiError,
  );
}

export function completeCycle(
  slug: string,
  cycleId: string,
): Promise<CycleDetail> {
  return confirmRequest<CycleDetail>(
    `${cycleItem(slug, cycleId)}/complete`,
    'Failed to complete cycle',
    CyclesApiError,
  );
}

export function reopenCycle(
  slug: string,
  cycleId: string,
): Promise<CycleDetail> {
  return confirmRequest<CycleDetail>(
    `${cycleItem(slug, cycleId)}/reopen`,
    'Failed to reopen cycle',
    CyclesApiError,
  );
}

export function archiveCycle(
  slug: string,
  cycleId: string,
): Promise<CycleDetail> {
  return confirmRequest<CycleDetail>(
    `${cycleItem(slug, cycleId)}/archive`,
    'Failed to archive cycle',
    CyclesApiError,
  );
}

export function restoreCycle(
  slug: string,
  cycleId: string,
): Promise<CycleDetail> {
  return confirmRequest<CycleDetail>(
    `${cycleItem(slug, cycleId)}/restore`,
    'Failed to restore cycle',
    CyclesApiError,
  );
}

// Delete is gated to future PLANNED cycles and confirms with `{ confirm: true }`
// (locked decision — not a typed name; the response carries unassignedIssues
// so the confirm dialog can state the blast radius).
export function deleteCycle(
  slug: string,
  cycleId: string,
): Promise<DeleteCycleResponse> {
  return requestJson<DeleteCycleResponse>(
    cycleItem(slug, cycleId),
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to delete cycle',
    CyclesApiError,
  );
}

export { CyclesApiError as default };
