import type { CycleCard } from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Cycles mock data — the exact `ListCyclesResponse` shape
// (`{ cycles: CycleCard[] }`), not a parallel type.
//
// Mirrors the rows in shipyard.pen Screen / Cycles - List (DiiJw):
//   Planned   2 · Sprint 26 · Mobile, Sprint 25 · Onboarding
//   Active    1 · Sprint 24 · Checkout
//   Completed 2 · Sprint 23 · Auth, Sprint 22 · Billing
// plus one archived cycle so the Archived tab has something to render.
//
// Order is what `GET /cycles?sort=startDate&order=desc` returns (the page's
// default request), so the list groups preserve API order within a group.
// ─────────────────────────────────────────────────────────────────────────────

const workspaceId = 'ws_mock';
const now = new Date().toISOString();

export const MOCK_CYCLES: CycleCard[] = [
  {
    id: 'cyc_sprint_26',
    workspaceId,
    name: 'Sprint 26 · Mobile',
    status: 'PLANNED',
    startDate: '2025-12-29',
    endDate: '2026-01-11',
    archivedAt: null,
    progress: { total: 0, completed: 0, percent: null },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cyc_sprint_25',
    workspaceId,
    name: 'Sprint 25 · Onboarding',
    status: 'PLANNED',
    startDate: '2025-12-15',
    endDate: '2025-12-28',
    archivedAt: null,
    progress: { total: 20, completed: 13, percent: 65 },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cyc_sprint_24',
    workspaceId,
    name: 'Sprint 24 · Checkout',
    status: 'ACTIVE',
    startDate: '2025-12-01',
    endDate: '2025-12-14',
    archivedAt: null,
    progress: { total: 20, completed: 13, percent: 65 },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cyc_sprint_23',
    workspaceId,
    name: 'Sprint 23 · Auth',
    status: 'COMPLETED',
    startDate: '2025-11-17',
    endDate: '2025-11-30',
    archivedAt: null,
    progress: { total: 18, completed: 18, percent: 100 },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cyc_sprint_22',
    workspaceId,
    name: 'Sprint 22 · Billing',
    status: 'COMPLETED',
    startDate: '2025-11-03',
    endDate: '2025-11-16',
    archivedAt: null,
    progress: { total: 12, completed: 12, percent: 100 },
    createdAt: now,
    updatedAt: now,
  },
];

/** Archived cycles — `GET /cycles?archived=true` (read-only + Restore). */
export const MOCK_ARCHIVED_CYCLES: CycleCard[] = [
  {
    id: 'cyc_sprint_21',
    workspaceId,
    name: 'Sprint 21 · Search',
    status: 'COMPLETED',
    startDate: '2025-10-20',
    endDate: '2025-11-02',
    archivedAt: '2025-11-04T09:12:00.000Z',
    progress: { total: 14, completed: 14, percent: 100 },
    createdAt: now,
    updatedAt: now,
  },
];

export const MOCK_CYCLES_LIST_RESPONSE = {
  cycles: MOCK_CYCLES,
};
