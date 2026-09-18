import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import type { WorkspaceRequestContext } from '../../../../src/common/guards/workspace-context.js';
import type { McpCredential } from '../../../../src/features/mcp/auth.js';
import { advertisedTools } from '../../../../src/features/mcp/registry.js';
import { addCommentTool } from '../../../../src/features/mcp/tools/add-comment.js';
import { assignIssueTool } from '../../../../src/features/mcp/tools/assign-issue.js';
import { blockIssueTool } from '../../../../src/features/mcp/tools/block-issue.js';
import { createIssueTool } from '../../../../src/features/mcp/tools/create-issue.js';
import { setIssueStatusTool } from '../../../../src/features/mcp/tools/set-issue-status.js';
import { updateIssueTool } from '../../../../src/features/mcp/tools/update-issue.js';
import { issuesService } from '../../../../src/features/issues/service.js';
import type { McpCallToolResult } from '@shipyard/shared';

/**
 * The six additive write tools (F13, M7) — api-design §6.2, §7, §8.2, §9.
 *
 * The milestone's gate is the reason this file exists in this shape: *writes
 * land with their history, activity and notification rows, asserted against the
 * database.* So every test here reads the rows back through Prisma rather than
 * trusting the tool's own text — a tool result is a claim, and the tables are
 * the fact.
 *
 * Handlers are called directly with a resolved credential, like the read suite:
 * the transport, credential resolution and argument validation have their own
 * files, and what is left to prove — that a write reaches the services the HTTP
 * routes call, and leaves the rows they would have left — is only testable
 * against the real database.
 *
 * Refusals are asserted in both directions: a name that resolves to nothing is
 * an actionable tool result **with nothing written**, while the service's own
 * rules (a finished issue cannot be blocked) are thrown and mapped by the
 * transport — the two must not be confused with each other.
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
  // What a member with write scopes carries: READ is unioned in at issuance.
  const credential: McpCredential = {
    tokenId: `token_${suffix}`,
    userId: owner.id,
    workspaceId: workspace.id,
    scopes: ['READ', 'ISSUES_WRITE', 'COMMENTS_WRITE'],
  };

  return {
    owner,
    teammate,
    workspace,
    context,
    credential,
    tool: { context, credential },
  };
}

function textOf(result: McpCallToolResult): string {
  return result.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');
}

/** History events for an issue, unordered — one row per changed concern. */
async function historyEvents(issueId: string): Promise<string[]> {
  const rows = await prisma.issueHistory.findMany({ where: { issueId } });

  return rows.map((row) => row.event).sort();
}

async function activityKinds(workspaceId: string): Promise<string[]> {
  const rows = await prisma.activityEvent.findMany({ where: { workspaceId } });

  return rows.map((row) => row.kind).sort();
}

beforeEach(async () => {
  await resetDatabase();
});

describe('shipyard_create_issue', () => {
  it('creates the issue with its history row, its activity row and its defaults', async () => {
    const { tool, context, owner } = await seedWorkspace();

    const result = await createIssueTool.handler(
      { title: 'Wire up the audit trail' },
      tool,
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Created SHIP-1');

    const issue = await prisma.issue.findFirstOrThrow({
      where: { workspaceId: context.workspaceId },
    });

    expect(issue.title).toBe('Wire up the audit trail');
    expect(issue.seqNumber).toBe(1);
    // The service's defaults, untouched by the tool layer.
    expect(issue.status).toBe('BACKLOG');
    expect(issue.priority).toBe('NO_PRIORITY');
    expect(issue.creatorId).toBe(owner.id);
    expect(issue.assigneeId).toBeNull();

    expect(await historyEvents(issue.id)).toEqual(['CREATED']);
    expect(await activityKinds(context.workspaceId)).toEqual(['ISSUE_CREATED']);
  });

  it('resolves assignee, project and labels by name before anything is written', async () => {
    const { tool, context, teammate } = await seedWorkspace();
    const project = await prisma.project.create({
      data: {
        workspaceId: context.workspaceId,
        name: 'Harbor Platform',
        ownerId: teammate.id,
      },
    });
    const label = await prisma.label.create({
      data: {
        workspaceId: context.workspaceId,
        name: 'hardening',
        color: '#6B7280',
      },
    });

    await createIssueTool.handler(
      {
        title: 'Roll the dev database forward',
        assignee: 'Omar Farouk',
        project: 'Harbor Platform',
        labels: ['hardening'],
        priority: 'HIGH',
      },
      tool,
    );

    const issue = await prisma.issue.findFirstOrThrow({
      where: { workspaceId: context.workspaceId },
      include: { labels: true },
    });

    expect(issue.assigneeId).toBe(teammate.id);
    expect(issue.projectId).toBe(project.id);
    expect(issue.priority).toBe('HIGH');
    expect(issue.labels.map((join) => join.labelId)).toEqual([label.id]);
  });

  it('creates nothing at all when a label does not exist', async () => {
    const { tool, context } = await seedWorkspace();

    const result = await createIssueTool.handler(
      { title: 'Anything', labels: ['ghost-label'] },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No label named ghost-label');
    expect(await prisma.issue.count()).toBe(0);
    expect(await activityKinds(context.workspaceId)).toEqual([]);
  });

  it('notifies the assignee, and never for a self-assignment', async () => {
    const { tool, context, teammate } = await seedWorkspace();

    await createIssueTool.handler(
      { title: 'Hand this to Omar', assignee: 'Omar Farouk' },
      tool,
    );

    const notifications = await prisma.notification.findMany({
      where: { workspaceId: context.workspaceId },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.recipientId).toBe(teammate.id);
    expect(notifications[0]?.type).toBe('ASSIGNMENT');

    // `me` is the credential's owner: assigning yourself is not news (F6 D8).
    await createIssueTool.handler(
      { title: 'Mine all mine', assignee: 'me' },
      tool,
    );

    const after = await prisma.notification.findMany({
      where: { workspaceId: context.workspaceId },
    });

    expect(after).toHaveLength(1);
  });
});

describe('shipyard_update_issue', () => {
  it('writes one history row per changed concern, and none for a description edit', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Original title',
    });

    const result = await updateIssueTool.handler(
      {
        issue: issue.identifier,
        title: 'Sharper title',
        priority: 'URGENT',
        description: 'Now with detail.',
      },
      tool,
    );

    expect(result.isError).toBeUndefined();
    // description is deliberately not an audited concern (issues data-model D7).
    expect(await historyEvents(issue.id)).toEqual([
      'CREATED',
      'PRIORITY_CHANGED',
      'TITLE_CHANGED',
    ]);

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.title).toBe('Sharper title');
    expect(stored.priority).toBe('URGENT');
    expect(stored.description).toBe('Now with detail.');
    // Content edits are audited in history, not in the activity feed: the feed
    // carries state changes (status, assignment, blocked), which is why a
    // title/priority edit leaves the workspace timeline alone.
    expect(await activityKinds(context.workspaceId)).toEqual(['ISSUE_CREATED']);
  });

  it('moves an issue into a cycle by name, and null takes it out again', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Cycle work',
    });
    const cycle = await prisma.cycle.create({
      data: {
        workspaceId: context.workspaceId,
        name: 'September',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
      },
    });

    await updateIssueTool.handler(
      { issue: issue.identifier, cycle: 'September' },
      tool,
    );

    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .cycleId,
    ).toBe(cycle.id);

    await updateIssueTool.handler(
      { issue: issue.identifier, cycle: null },
      tool,
    );

    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .cycleId,
    ).toBeNull();
    expect(await historyEvents(issue.id)).toEqual([
      'CREATED',
      'CYCLE_CHANGED',
      'CYCLE_CHANGED',
    ]);
  });

  it('reports a project that does not exist and leaves the issue alone', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Unmoved',
    });

    const result = await updateIssueTool.handler(
      { issue: issue.identifier, project: 'Nonexistent' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No project in this workspace matches');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .projectId,
    ).toBeNull();
    expect(await historyEvents(issue.id)).toEqual(['CREATED']);
  });

  it('refuses a call that changes nothing rather than pretending', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Untouched',
    });

    const result = await updateIssueTool.handler(
      { issue: issue.identifier },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(result._meta?.['io.shipyard/errorCode']).toBe('NOTHING_TO_CHANGE');
  });
});

describe('shipyard_set_issue_status', () => {
  it('moves the issue and records the transition', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Move me',
    });

    const result = await setIssueStatusTool.handler(
      { issue: issue.identifier, status: 'IN_PROGRESS' },
      tool,
    );

    expect(textOf(result)).toContain('Moved SHIP-1 to in_progress');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .status,
    ).toBe('IN_PROGRESS');
    expect(await historyEvents(issue.id)).toEqual([
      'CREATED',
      'STATUS_CHANGED',
    ]);
  });

  it('says so and writes nothing when the state is already what was asked', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Already here',
      status: 'TODO',
    });

    const result = await setIssueStatusTool.handler(
      { issue: issue.identifier, status: 'TODO' },
      tool,
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('already todo');
    expect(await historyEvents(issue.id)).toEqual(['CREATED']);
  });

  it('clears the blocked flag implicitly when the issue is finished', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Blocked then done',
      status: 'IN_PROGRESS',
    });
    // Blocked is set through update: create cannot file an issue already
    // blocked (issues api-design §5.2), so the seeded state goes the same way a
    // person would set it.
    await issuesService.update(context, owner.id, issue.id, {
      blocked: true,
      blockedReason: 'waiting on review',
    });

    const result = await setIssueStatusTool.handler(
      { issue: issue.identifier, status: 'DONE' },
      tool,
    );

    expect(textOf(result)).toContain('blocked: cleared');

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.status).toBe('DONE');
    expect(stored.blocked).toBe(false);
    expect(stored.blockedReason).toBeNull();
    expect(await historyEvents(issue.id)).toContain('BLOCKED_CLEARED');
  });
});

describe('shipyard_assign_issue', () => {
  it('assigns a teammate by name and records the assignment', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Hand over',
    });

    const result = await assignIssueTool.handler(
      { issue: issue.identifier, assignee: 'Omar Farouk' },
      tool,
    );

    expect(textOf(result)).toContain('Assigned SHIP-1 to Omar Farouk');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .assigneeId,
    ).toBe(teammate.id);
    expect(await historyEvents(issue.id)).toEqual(['ASSIGNED', 'CREATED']);

    const notifications = await prisma.notification.findMany({
      where: { workspaceId: context.workspaceId },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.recipientId).toBe(teammate.id);
  });

  it('refuses a partial name rather than guessing which member was meant', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Ambiguous',
      assigneeId: teammate.id,
    });

    // Two members can share a first name, so a mutation matches the full name,
    // an email, a user id or `me` — and says what to send instead.
    const result = await assignIssueTool.handler(
      { issue: issue.identifier, assignee: 'omar' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('full name');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .assigneeId,
    ).toBe(teammate.id);
    // Creation-time assignment writes no ASSIGNED row — the issue was born with
    // its owner — and no second notification: the create is this issue's only one.
    expect(await historyEvents(issue.id)).toEqual(['CREATED']);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('unassigns on null', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Nobody’s problem',
      assigneeId: owner.id,
    });

    await assignIssueTool.handler(
      { issue: issue.identifier, assignee: null },
      tool,
    );

    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .assigneeId,
    ).toBeNull();
    expect(await historyEvents(issue.id)).toEqual(['CREATED', 'UNASSIGNED']);
  });

  it('changes nothing when the name matches nobody', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Sticky owner',
      assigneeId: teammate.id,
    });

    const result = await assignIssueTool.handler(
      { issue: issue.identifier, assignee: 'Nobody At All' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(result._meta?.['io.shipyard/errorCode']).toBe('ASSIGNEE_NOT_FOUND');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .assigneeId,
    ).toBe(teammate.id);
  });
});

describe('shipyard_block_issue', () => {
  it('sets the flag with its reason, and clearing it drops the reason', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Waiting on infra',
      status: 'IN_PROGRESS',
    });

    const blocked = await blockIssueTool.handler(
      { issue: issue.identifier, blocked: true, reason: 'no staging box' },
      tool,
    );

    expect(textOf(blocked)).toContain('Blocked SHIP-1');

    let stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.blocked).toBe(true);
    expect(stored.blockedReason).toBe('no staging box');

    await blockIssueTool.handler(
      { issue: issue.identifier, blocked: false },
      tool,
    );

    stored = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(stored.blocked).toBe(false);
    expect(stored.blockedReason).toBeNull();
    expect(await historyEvents(issue.id)).toEqual([
      'BLOCKED_CLEARED',
      'BLOCKED_SET',
      'CREATED',
    ]);
  });

  it('refuses a reason sent with blocked: false instead of discarding it', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Contradiction',
      status: 'IN_PROGRESS',
    });
    await issuesService.update(context, owner.id, issue.id, {
      blocked: true,
      blockedReason: 'still waiting',
    });

    const result = await blockIssueTool.handler(
      { issue: issue.identifier, blocked: false, reason: 'because shipped' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(result._meta?.['io.shipyard/errorCode']).toBe(
      'REASON_WITHOUT_BLOCKED',
    );

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
    });

    expect(stored.blocked).toBe(true);
    expect(stored.blockedReason).toBe('still waiting');
  });

  it('lets the service refuse blocking a finished issue', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Already shipped',
      status: 'DONE',
    });

    await expect(
      blockIssueTool.handler(
        { issue: issue.identifier, blocked: true, reason: 'too late' },
        tool,
      ),
    ).rejects.toThrow('Only unfinished issues can be blocked');

    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .blocked,
    ).toBe(false);
  });
});

describe('shipyard_add_comment', () => {
  it('records the comment with its activity row', async () => {
    const { tool, context, owner } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Discuss me',
    });

    const result = await addCommentTool.handler(
      { issue: issue.identifier, body: 'Looks good to me.' },
      tool,
    );

    expect(textOf(result)).toContain('Commented on SHIP-1');

    const comment = await prisma.comment.findFirstOrThrow({
      where: { issueId: issue.id },
    });

    expect(comment.content).toBe('Looks good to me.');
    expect(comment.authorId).toBe(owner.id);
    expect(await activityKinds(context.workspaceId)).toContain(
      'COMMENT_CREATED',
    );
  });

  it('notifies the mentioned teammate, and never the author', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Mention me',
    });

    await addCommentTool.handler(
      { issue: issue.identifier, body: 'ping @Omar about the deploy' },
      tool,
    );
    await addCommentTool.handler(
      { issue: issue.identifier, body: 'and @Ada notes for myself' },
      tool,
    );

    const mentions = await prisma.commentMention.findMany({
      where: { comment: { issueId: issue.id } },
    });

    expect(mentions.map((mention) => mention.mentionedUserId).sort()).toEqual(
      [owner.id, teammate.id].sort(),
    );

    const notifications = await prisma.notification.findMany({
      where: { workspaceId: context.workspaceId },
    });

    // One fan-out per distinct hit, minus the author's own mention (F8 D6).
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.recipientId).toBe(teammate.id);
    expect(notifications[0]?.type).toBe('MENTION');
  });
});

describe('the write surface as a whole', () => {
  it('advertises a write only to a credential that carries its scope', () => {
    const readOnly = advertisedTools(['READ']).map((tool) => tool.name);
    const writer = advertisedTools(['READ', 'ISSUES_WRITE']).map(
      (tool) => tool.name,
    );

    expect(readOnly).not.toContain('shipyard_create_issue');
    expect(readOnly).not.toContain('shipyard_add_comment');
    expect(writer).toContain('shipyard_create_issue');
    // COMMENTS_WRITE is its own permission: an issue writer still cannot speak.
    expect(writer).not.toContain('shipyard_add_comment');
  });

  it('cannot write into another workspace, and treats its identifiers as absent', async () => {
    const { tool, context } = await seedWorkspace();
    const other = await seedWorkspace();
    const foreign = await issuesService.create(other.context, other.owner.id, {
      title: 'Not yours',
    });

    const result = await updateIssueTool.handler(
      { issue: foreign.identifier, title: 'Hijacked' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(result._meta?.['io.shipyard/errorCode']).toBe('ISSUE_NOT_FOUND');
    expect(textOf(result)).not.toContain('Not yours');
    expect(
      (await prisma.issue.findUniqueOrThrow({ where: { id: foreign.id } }))
        .title,
    ).toBe('Not yours');
    expect(await historyEvents(foreign.id)).toEqual(['CREATED']);
    // Nothing was written in the caller's own workspace either.
    expect(
      await prisma.issue.count({ where: { workspaceId: context.workspaceId } }),
    ).toBe(0);
  });

  it('never returns an email address or a token fragment', async () => {
    const { tool, context, owner, teammate } = await seedWorkspace();
    const issue = await issuesService.create(context, owner.id, {
      title: 'Quiet result',
    });

    const results = [
      await createIssueTool.handler(
        { title: 'Another', assignee: 'Omar Farouk' },
        tool,
      ),
      await updateIssueTool.handler(
        { issue: issue.identifier, title: 'Renamed' },
        tool,
      ),
      await assignIssueTool.handler(
        { issue: issue.identifier, assignee: 'Omar Farouk' },
        tool,
      ),
      await addCommentTool.handler(
        { issue: issue.identifier, body: 'hello @Omar' },
        tool,
      ),
    ];

    for (const result of results) {
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(teammate.email);
      expect(serialised).not.toContain(owner.email);
      expect(serialised).not.toContain('shp_');
    }
  });
});
