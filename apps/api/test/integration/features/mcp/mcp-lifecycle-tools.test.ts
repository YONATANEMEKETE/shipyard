import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import type { WorkspaceRequestContext } from '../../../../src/common/guards/workspace-context.js';
import type { McpCredential } from '../../../../src/features/mcp/auth.js';
import { advertisedTools } from '../../../../src/features/mcp/registry.js';
import { archiveIssueTool } from '../../../../src/features/mcp/tools/archive-issue.js';
import { addCommentTool } from '../../../../src/features/mcp/tools/add-comment.js';
import { deleteIssueTool } from '../../../../src/features/mcp/tools/delete-issue.js';
import { restoreIssueTool } from '../../../../src/features/mcp/tools/restore-issue.js';
import { issuesService } from '../../../../src/features/issues/service.js';
import type { McpCallToolResult } from '@shipyard/shared';

/**
 * The three gated lifecycle tools (F13, M8) — api-design §6.3, spec §3.4, §9.
 *
 * The milestone's gate is *delete requires scope + `OWNER|ADMIN` + explicit human
 * confirmation*, and this file asserts the parts a server can assert: the scope
 * gate by name, the role re-asserted against the **live** membership (a
 * credential downgraded after issuance is refused), the blast radius of a
 * permanent delete measured against the tables, and the annotation that carries
 * the confirmation story to the host.
 *
 * The confirmation itself is deliberately *not* testable here: spec §3.4 puts it
 * with the person, through their client, and a model-typed confirmation is never
 * consent — so there is nothing typed for a test to check, and that absence is
 * the design. What is asserted instead is that the destructive call is the one
 * annotated destructive, and that nothing about the irreversible action is
 * reachable without the scope.
 *
 * Refusals split the same way they do for the writes: a reference that resolves
 * to nothing is an actionable tool result with nothing changed, while the
 * service's own rules (already archived, not archived, not an Owner/Admin) are
 * thrown and mapped by the transport.
 */

let seeded = 0;

function nonce(): string {
  seeded += 1;

  return `${Date.now()}-${seeded}`;
}

async function seedWorkspace(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  const suffix = nonce();
  const owner = await prisma.user.create({
    data: {
      id: `user_${suffix}`,
      name: 'Ada Lovelace',
      email: `ada-${suffix}@example.com`,
      emailVerified: true,
    },
  });
  const teammate = await prisma.user.create({
    data: {
      id: `mate_${suffix}`,
      name: 'Omar Farouk',
      email: `omar-${suffix}@example.com`,
      emailVerified: true,
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'Harbor', slug: `harbor-${suffix}`, status: 'ACTIVE' },
  });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: owner.id, role },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: teammate.id, role: 'MEMBER' },
  });

  const context: WorkspaceRequestContext = {
    workspaceId: workspace.id,
    memberId: member.id,
    slug: workspace.slug,
    status: 'ACTIVE',
    role,
  };
  // A credential at its ceiling for this workspace: READ is unioned in at
  // issuance, and ISSUES_DELETE is what the lifecycle tools need.
  const credential: McpCredential = {
    tokenId: `token_${suffix}`,
    userId: owner.id,
    workspaceId: workspace.id,
    scopes: ['READ', 'ISSUES_WRITE', 'COMMENTS_WRITE', 'ISSUES_DELETE'],
  };
  const memberCredential: McpCredential = { ...credential, scopes: ['READ'] };

  return {
    owner,
    teammate,
    workspace,
    context,
    credential,
    tool: { context, credential },
    memberTool: {
      context: { ...context, role: 'MEMBER' as const },
      credential: memberCredential,
    },
  };
}

function textOf(result: McpCallToolResult): string {
  return result.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');
}

async function historyEvents(issueId: string): Promise<string[]> {
  const rows = await prisma.issueHistory.findMany({ where: { issueId } });

  return rows.map((row) => row.event).sort();
}

beforeEach(async () => {
  await resetDatabase();
});

describe('shipyard_archive_issue', () => {
  it('archives the issue, keeping it, with its history and activity rows', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Old business',
    });

    const result = await archiveIssueTool.handler(
      { issue: issue.identifier },
      tool,
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Archived SHIP-1');
    expect(textOf(result)).toContain('reversible');

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    // Nothing was removed: the row is there, with a timestamp on it.
    expect(stored.archivedAt).not.toBeNull();
    expect(stored.title).toBe('Old business');
    expect(await historyEvents(issue.id)).toEqual(['ARCHIVED', 'CREATED']);

    const kinds = (
      await prisma.activityEvent.findMany({
        where: { workspaceId: context.workspaceId },
      })
    ).map((row) => row.kind);

    expect(kinds).toContain('ISSUE_ARCHIVED');
  });

  it('lets the service refuse an issue that is already archived', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Twice over',
    });

    await archiveIssueTool.handler({ issue: issue.identifier }, tool);
    const first = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    await expect(
      archiveIssueTool.handler({ issue: issue.identifier }, tool),
    ).rejects.toThrow();

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.archivedAt).toEqual(first.archivedAt);
    expect(await historyEvents(issue.id)).toEqual(['ARCHIVED', 'CREATED']);
  });
});

describe('shipyard_restore_issue', () => {
  it('brings an archived issue back, in the state it had', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Comes back',
      status: 'IN_PROGRESS',
    });

    await archiveIssueTool.handler({ issue: issue.identifier }, tool);

    const result = await restoreIssueTool.handler(
      { issue: issue.identifier },
      tool,
    );

    expect(textOf(result)).toContain('Restored SHIP-1');

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.archivedAt).toBeNull();
    // The work is untouched: only `archivedAt` moved.
    expect(stored.status).toBe('IN_PROGRESS');
    expect(await historyEvents(issue.id)).toEqual([
      'ARCHIVED',
      'CREATED',
      'RESTORED',
    ]);
  });

  it('lets the service refuse an issue that was never archived', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Never archived',
    });

    await expect(
      restoreIssueTool.handler({ issue: issue.identifier }, tool),
    ).rejects.toThrow();

    expect(await historyEvents(issue.id)).toEqual(['CREATED']);
  });
});

describe('shipyard_delete_issue', () => {
  it('removes the issue, its comments and its notifications, and records the deletion', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Delete me',
      assigneeId: teammate.id,
    });
    await addCommentTool.handler(
      { issue: issue.identifier, body: 'ping @Omar before you delete this' },
      tool,
    );

    expect(await prisma.comment.count()).toBe(1);
    expect(await prisma.notification.count()).toBeGreaterThan(0);

    const result = await deleteIssueTool.handler(
      { issue: issue.identifier },
      tool,
    );

    expect(textOf(result)).toContain('Deleted SHIP-1');
    expect(textOf(result)).toContain('permanent');

    // The row and everything that hung off it are gone…
    expect(
      await prisma.issue.findUnique({ where: { id: issue.id } }),
    ).toBeNull();
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.issueHistory.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);

    // …and the activity row outlives the deletion it describes (issues D3),
    // because it holds the identifier as plain text rather than a foreign key.
    const events = await prisma.activityEvent.findMany({
      where: { workspaceId: context.workspaceId },
    });
    const deleted = events.find((event) => event.kind === 'ISSUE_DELETED');

    expect(deleted).toBeDefined();
    expect(deleted?.entityTitle).toContain('SHIP-1');
    expect(deleted?.entityId).toBe(issue.id);
  });

  it('deletes an archived issue too — archive state does not shield it', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Archived then deleted',
    });

    await archiveIssueTool.handler({ issue: issue.identifier }, tool);
    await deleteIssueTool.handler({ issue: issue.identifier }, tool);

    expect(
      await prisma.issue.findUnique({ where: { id: issue.id } }),
    ).toBeNull();
  });

  it('accepts the internal id as well, supplying the identifier itself', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'By id',
    });

    // The product's delete contract wants the exact SHIP-### typed by a person.
    // On this surface the human's confirmation arrives through the host, and the
    // identifier is resolved by the tool — so an internal id works, and no caller
    // ever retypes an identifier the server already knows.
    const result = await deleteIssueTool.handler({ issue: issue.id }, tool);

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Deleted SHIP-1');
    expect(
      await prisma.issue.findUnique({ where: { id: issue.id } }),
    ).toBeNull();
  });

  it('re-asserts the live role: a credential held by a member cannot delete', async () => {
    const { memberTool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Out of your hands',
    });

    // Built by hand rather than issued: a token carrying ISSUES_DELETE belongs to
    // an Owner or Admin when it is minted, but the role is re-checked on every
    // call — the issuance ceiling is convenience, never the boundary.
    await expect(
      deleteIssueTool.handler({ issue: issue.identifier }, memberTool),
    ).rejects.toThrow(/role/i);

    expect(
      await prisma.issue.findUnique({ where: { id: issue.id } }),
    ).not.toBeNull();
  });

  it('says nothing was deleted when the identifier resolves to nothing', async () => {
    const { tool } = await seedWorkspace();

    const result = await deleteIssueTool.handler({ issue: 'SHIP-9999' }, tool);

    expect(result.isError).toBe(true);
    expect(result._meta?.['io.shipyard/errorCode']).toBe('ISSUE_NOT_FOUND');
    expect(textOf(result)).toContain('No issue in this workspace matches');
    expect(textOf(result)).toContain('SHIP-9999');
    expect(await prisma.issue.count()).toBe(0);
  });
});

describe('the lifecycle surface as a whole', () => {
  it('advertises the three gated tools to a delete scope, alongside the reads', () => {
    const names = advertisedTools(['READ', 'ISSUES_DELETE']).map(
      (tool) => tool.name,
    );

    // READ travels with every credential, so a delete-capable connection sees
    // the reads first and the lifecycle tools appended — and nothing else: a
    // delete scope is not a write scope.
    expect(names).toEqual([
      'shipyard_list_issues',
      'shipyard_get_issue',
      'shipyard_search',
      'shipyard_list_projects',
      'shipyard_list_cycles',
      'shipyard_workspace_overview',
      'shipyard_recent_activity',
      'shipyard_list_members',
      'shipyard_archive_issue',
      'shipyard_restore_issue',
      'shipyard_delete_issue',
    ]);

    // An issue writer without the delete permission does not even see them.
    const writer = advertisedTools(['READ', 'ISSUES_WRITE']).map(
      (tool) => tool.name,
    );

    expect(writer).not.toContain('shipyard_archive_issue');
    expect(writer).not.toContain('shipyard_delete_issue');
  });

  it('annotates only the irreversible call as destructive', () => {
    // The annotation is what a host turns into a confirmation prompt, so it is
    // the half of the spec §3.4 story the server owns.
    expect(deleteIssueTool.definition.annotations?.destructiveHint).toBe(true);
    expect(deleteIssueTool.definition.annotations?.readOnlyHint).toBe(false);
    expect(archiveIssueTool.definition.annotations?.destructiveHint).toBe(
      false,
    );
    expect(restoreIssueTool.definition.annotations?.destructiveHint).toBe(
      false,
    );
  });

  it('cannot reach another workspace, and says not-found there too', async () => {
    const { tool } = await seedWorkspace();
    const other = await seedWorkspace();
    const foreign = await issuesService.create(other.context, other.owner.id, {
      title: 'Not yours to delete',
    });

    for (const result of [
      await archiveIssueTool.handler({ issue: foreign.identifier }, tool),
      await restoreIssueTool.handler({ issue: foreign.identifier }, tool),
      await deleteIssueTool.handler({ issue: foreign.identifier }, tool),
    ]) {
      expect(result.isError).toBe(true);
      expect(result._meta?.['io.shipyard/errorCode']).toBe('ISSUE_NOT_FOUND');
      expect(textOf(result)).not.toContain('Not yours to delete');
    }

    // Untouched, and none of the three refusals wrote anything anywhere.
    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: foreign.id },
    });

    expect(stored.archivedAt).toBeNull();
    expect(await historyEvents(foreign.id)).toEqual(['CREATED']);
  });
});
