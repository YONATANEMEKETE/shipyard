'use client';

import { ArrowLeftRight, Cable, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { McpTokenCard, McpTokenScope } from '@shipyard/shared';

import { CreateAgentTokenDialog } from '@/components/settings/create-agent-token-dialog';
import { DeleteAgentTokenDialog } from '@/components/settings/delete-agent-token-dialog';
import { RevokeAgentTokenDialog } from '@/components/settings/revoke-agent-token-dialog';
import { SettingsCard } from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAgentTokens } from '@/hooks/use-agent-tokens';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { getWorkspaceRole } from '@/lib/workspace/role';
import { cn } from '@/lib/utils';

/**
 * Agent access card — Account Settings, between Security and Preferences
 * (F13).
 *
 * The member's **own** connections in the active workspace. Workspace-wide
 * visibility exists (`?all=true` is an Owner/Admin capability) but belongs to
 * Workspace Settings, not here: this card answers "what can act as me?", the
 * admin section answers "what can act in this workspace?".
 *
 * A token belongs to exactly one workspace (data-model D3), which is why this
 * card is workspace-scoped in the URL and never offers a workspace picker — the
 * slug in the route is the workspace, switching workspaces switches the list,
 * and the card says outright which workspace it is showing. Changing workspace
 * is a navigation, not a form field: a binding that came from a picker could
 * disagree with the page it was chosen on, and the scope ceiling is computed
 * against *this* workspace's role. The other workspaces are one link away
 * instead (the row at the bottom), which is the discovery problem the picker
 * would have been solving.
 *
 * Counts of note, all visible to the member rather than hidden:
 * - `tokenPrefix` is the only part of the credential stored in clear, shown so a
 *   row can be matched to a config file;
 * - `lastUsedAt` is how a member notices a credential being used that they
 *   stopped using;
 * - revoked and expired rows stay listed (revocation is a timestamp on the
 *   row, data-model D5) until the member deletes them: the row is the history,
 *   deletion is the clean-up, and only the member decides when the history has
 *   served its purpose.
 *
 * The `.pen` canvas has no frame for this card yet; geometry follows the
 * existing cards (18px child gap from `SettingsCard`, 12px-radius controls).
 */

const SCOPE_LABELS: Record<McpTokenScope, string> = {
  READ: 'Read',
  ISSUES_WRITE: 'Edit issues',
  COMMENTS_WRITE: 'Comment',
  ISSUES_DELETE: 'Delete issues',
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

type TokenState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** Expiry is evaluated at render time: the API refuses an expired token at
 *  use time, so the surface must not claim "Active" for a dead credential. */
function stateOf(token: McpTokenCard): TokenState {
  if (token.revokedAt) return 'REVOKED';
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

const STATE_STYLES: Record<TokenState, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'border-ds-success/30 bg-ds-success-soft text-ds-success',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'border-ds-warning/30 bg-ds-warning-soft text-ds-warning',
  },
  REVOKED: {
    label: 'Revoked',
    className: 'border-ds-border bg-ds-bg text-muted-foreground',
  },
};

function StateChip({ state }: { state: TokenState }) {
  const style = STATE_STYLES[state];
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full border px-2 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.6px]',
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function TokenSkeletonRow() {
  return (
    <div className="flex h-[74px] items-center gap-3 rounded-lg border border-ds-border bg-ds-surface-subtle p-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="h-3 w-28 animate-pulse rounded bg-ds-border/60" />
        <span className="h-2.5 w-40 animate-pulse rounded bg-ds-border/40" />
      </span>
    </div>
  );
}

export function AgentAccessCard() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<McpTokenCard | null>(null);
  const [deleting, setDeleting] = useState<McpTokenCard | null>(null);

  const tokensQuery = useAgentTokens(slug);
  const workspacesQuery = useWorkspaces();

  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const role = getWorkspaceRole(workspaces, slug);
  // The workspace this card is scoped to, and the member's other workspaces.
  // `workspaceName` is null while the list is loading, so the copy falls back to
  // "this workspace" rather than confidently naming the wrong one.
  const workspaceName =
    workspaces.find((workspace) => workspace.slug === slug)?.name ?? null;
  const workspaceLabel = workspaceName ?? 'this workspace';
  const otherWorkspaces = workspaces.filter(
    (workspace) => workspace.slug !== slug,
  );

  const tokens = tokensQuery.data?.tokens ?? [];

  return (
    <SettingsCard eyebrow="Agent access" title="AI agent connections">
      <p className="text-[13px] leading-[1.5] text-muted-foreground">
        Connect an AI agent to {workspaceLabel} with a token that acts as you. A
        connection works in {workspaceLabel} only — treat it like a password,
        because anything the agent does is attributed to you, and it can never
        do more than your own role allows.
      </p>

      {tokensQuery.isPending ? (
        <div className="flex flex-col gap-2.5">
          <TokenSkeletonRow />
          <TokenSkeletonRow />
        </div>
      ) : tokensQuery.isError ? (
        <ErrorState
          title="Could not load your connections"
          description="The list of agent connections did not load. Retrying usually fixes it."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void tokensQuery.refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={Cable}
          title="No agent connections yet"
          description="Create a connection, then paste its token into your agent's MCP configuration. You can revoke it here at any time."
          action={
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
            >
              <Plus aria-hidden className="size-4" />
              Create connection
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {tokens.map((token) => {
              const state = stateOf(token);
              return (
                <li
                  key={token.id}
                  className="flex flex-col gap-3 rounded-lg border border-ds-border bg-ds-surface-subtle p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-semibold leading-none text-foreground">
                        {token.label}
                      </span>
                      <StateChip state={state} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {token.tokenPrefix}…
                      </span>
                      {token.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="inline-flex h-[18px] items-center rounded-full border border-ds-border bg-ds-surface px-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.4px] text-muted-foreground"
                        >
                          {SCOPE_LABELS[scope]}
                        </span>
                      ))}
                    </div>

                    <p className="text-[11px] leading-[1.5] text-muted-foreground">
                      Created {formatDate(token.createdAt)} · Last used{' '}
                      {token.lastUsedAt
                        ? formatDate(token.lastUsedAt)
                        : 'never'}
                      {token.expiresAt
                        ? ` · ${state === 'EXPIRED' ? 'Expired' : 'Expires'} ${formatDate(token.expiresAt)}`
                        : ''}
                      {token.revokedAt
                        ? ` · Revoked ${formatDate(token.revokedAt)}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:self-center">
                    {state === 'REVOKED' ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRevoking(token)}
                        className="border-ds-border text-muted-foreground hover:border-ds-danger/30 hover:bg-ds-danger-soft hover:text-ds-danger"
                      >
                        Revoke
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleting(token)}
                      aria-label={`Delete the connection ${token.label}`}
                      className="gap-1.5 border-ds-border text-muted-foreground hover:border-ds-danger/30 hover:bg-ds-danger-soft hover:text-ds-danger"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex w-full items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] leading-[1.5] text-muted-foreground">
              <KeyRound aria-hidden className="size-3.5 shrink-0" />
              Tokens are shown once, when they are created. Revoke one to stop
              it working; delete it to take it off this list.
            </p>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
            >
              <Plus aria-hidden className="size-4" />
              New connection
            </Button>
          </div>
        </>
      )}

      {/* Where the other workspaces are: a connection is bound to the workspace
          in the route, so the way to make one somewhere else is to go there —
          not a picker inside this card, which could mint a token for a
          workspace the page is not showing (and whose role ceiling differs). */}
      {otherWorkspaces.length > 0 && !tokensQuery.isError ? (
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-ds-border bg-ds-surface-subtle px-3 py-2.5">
          <ArrowLeftRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="text-[11px] leading-[1.5] text-muted-foreground">
            Connections work in one workspace only. Open
          </span>
          {otherWorkspaces.map((workspace) => (
            <Link
              key={workspace.slug}
              href={`/w/${workspace.slug}/settings/account`}
              className="inline-flex h-[22px] items-center rounded-full border border-ds-border bg-ds-surface px-2.5 text-[11px] font-semibold text-ds-brand transition-colors hover:bg-ds-brand-soft"
            >
              {workspace.name}
            </Link>
          ))}
          <span className="text-[11px] leading-[1.5] text-muted-foreground">
            to create a connection there.
          </span>
        </div>
      ) : null}

      <CreateAgentTokenDialog
        slug={slug}
        role={role}
        workspaceName={workspaceLabel}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {revoking ? (
        <RevokeAgentTokenDialog
          slug={slug}
          token={revoking}
          open
          onOpenChange={(open) => {
            if (!open) setRevoking(null);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteAgentTokenDialog
          slug={slug}
          token={deleting}
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        />
      ) : null}
    </SettingsCard>
  );
}
