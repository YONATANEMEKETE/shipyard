import type { CycleCard, CycleDetail } from '@shipyard/shared';
import { requestJson } from '@/lib/api/request';

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

export interface ListCyclesResponse {
  cycles: CycleCard[];
}

export interface ListCyclesParams {
  status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
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
    `${cyclesBase(slug)}/${encodeURIComponent(cycleId)}`,
    { method: 'GET' },
    'Failed to load cycle',
    CyclesApiError,
  );
}
