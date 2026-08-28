'use client';

import { Plus } from 'lucide-react';

import { Stagger, StaggerItem } from '@/components/motion/stagger';
import {
  WorkspaceCard,
  type WorkspaceCardInput,
} from '@/components/workspace/workspace-card';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Button } from '@/components/ui/button';

// Mock data — replaced by GET /api/v1/workspaces when the page is integrated.
// The card's input type widens the shared role to OWNER | ADMIN | MEMBER so
// all role styles can be previewed (ADMIN lands in F3).
const MOCK_WORKSPACES: WorkspaceCardInput[] = [
  {
    id: 'ws_acme1',
    slug: 'acme-studio',
    name: 'Acme Studio',
    icon: 'boxes',
    status: 'ACTIVE',
    role: 'OWNER',
    memberCount: 14,
  },
  {
    id: 'ws_harbor',
    slug: 'harbor-labs',
    name: 'Harbor Labs',
    icon: 'anchor',
    status: 'ACTIVE',
    role: 'ADMIN',
    memberCount: 8,
  },
  {
    id: 'ws_linear',
    slug: 'linear-clone',
    name: 'Linear Clone',
    icon: 'git-branch',
    status: 'ACTIVE',
    role: 'MEMBER',
    memberCount: 23,
  },
  {
    id: 'ws_northwind',
    slug: 'northwind-vault',
    name: 'Northwind Vault',
    icon: 'archive',
    status: 'ARCHIVED',
    role: 'OWNER',
    memberCount: 4,
  },
];

const activeWorkspaces = MOCK_WORKSPACES.filter(
  (workspace) => workspace.status === 'ACTIVE',
);
const archivedWorkspaces = MOCK_WORKSPACES.filter(
  (workspace) => workspace.status === 'ARCHIVED',
);

export default function SelectWorkspacePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Stagger className="flex w-full max-w-[580px] flex-col gap-6 sm:gap-7">
        {/* Intro Block — matches pen Display Heading + Support Copy */}
        <StaggerItem className="flex flex-col gap-3">
          <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-1.1px] text-foreground sm:text-[34px]">
            Choose a workspace.
          </h1>
          <p className="text-[13px] leading-[1.55] text-muted-foreground">
            You belong to several workspaces. Pick one to continue — your recent
            context is restored when you return.
          </p>
        </StaggerItem>

        {/* Active workspaces */}
        <StaggerItem className="flex flex-col gap-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Your workspaces · {activeWorkspaces.length} active
          </span>
          <div className="flex flex-col gap-2.5">
            {activeWorkspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                className="px-3.5 sm:px-4"
              />
            ))}
          </div>
        </StaggerItem>

        {/* Archived workspaces */}
        {archivedWorkspaces.length > 0 && (
          <StaggerItem className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
              Archived workspaces · read only
            </span>
            <div className="flex flex-col gap-2.5">
              {archivedWorkspaces.map((workspace) => (
                <WorkspaceCard
                  key={workspace.id}
                  workspace={workspace}
                  className="px-3.5 sm:px-4"
                />
              ))}
            </div>
          </StaggerItem>
        )}

        {/* Actions Row — New workspace (secondary) + Sign out (ghost).
            Stacks full-width on mobile so both targets stay touch-friendly. */}
        <StaggerItem className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* Secondary button matches pen: brand-soft fill, amber border + text */}
          <Button
            variant="secondary"
            className="h-11 w-full gap-2 border-amber-200 bg-ds-brand-soft px-3.5 text-xs font-semibold text-ds-brand hover:border-amber-300 sm:h-9 sm:w-auto"
          >
            <Plus className="h-[15px] w-[15px]" />
            New workspace
          </Button>
          <SignOutButton className="h-11 w-full sm:h-9 sm:w-auto" />
        </StaggerItem>
      </Stagger>
    </main>
  );
}
