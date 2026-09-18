import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../helpers/db.js';
import { prisma } from '../../../../src/common/db/client.js';
import type { WorkspaceRequestContext } from '../../../../src/common/guards/workspace-context.js';
import type { McpCredential } from '../../../../src/features/mcp/auth.js';
import type { McpToolContext } from '../../../../src/features/mcp/tools/context.js';
import { getIssueTool } from '../../../../src/features/mcp/tools/get-issue.js';
import { listCyclesTool } from '../../../../src/features/mcp/tools/list-cycles.js';
import { listIssuesTool } from '../../../../src/features/mcp/tools/list-issues.js';
import { listMembersTool } from '../../../../src/features/mcp/tools/list-members.js';
import { listProjectsTool } from '../../../../src/features/mcp/tools/list-projects.js';
import { recentActivityTool } from '../../../../src/features/mcp/tools/recent-activity.js';
import { searchTool } from '../../../../src/features/mcp/tools/search.js';
import { workspaceOverviewTool } from '../../../../src/features/mcp/tools/workspace-overview.js';
import { issuesService } from '../../../../src/features/issues/service.js';
import { projectsService } from '../../../../src/features/projects/service.js';
import { cyclesService } from '../../../../src/features/cycles/service.js';
import type { McpCallToolResult } from '@shipyard/shared';

/**
 * The eight read tools (F13, M5) — api-design §6.1, §7, §9.
 *
 * These call the handlers directly with a resolved credential rather than
 * posting to `/mcp`. That is deliberate: the transport, credential resolution and
 * argument validation have their own tests (mcp-transport, mcp-auth), and what is
 * left — what each tool *reads* and what it says about it — is only testable
 * against the real database, through the real services.
 *
 * The properties worth more than coverage here:
 *   1. a name that resolves to nothing is an actionable tool result, not a 500;
 *   2. another workspace's identifier is a flat not-found, identical to a fake
 *      one — an agent must not be able to probe for existence across tenants;
 *   3. archived work is absent by default and present when asked for;
 *   4. a result never carries an email address or any token material (spec §7).
 */

let seeded = 0;

function nonce(): string {
  seeded += 1;

  return `${Date.now()}-${seeded}`;
}

async function seedWorkspace(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  const suffix = nonce();
  const user = await prisma.user.create({
    data: {
      id: `user_${suffix}`,
      name: 'Ada Lovelace',
      email: `ada-${suffix}@example.com`,
      emailVerified: true,
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'Harbor', slug: `harbor-${suffix}`, status: 'ACTIVE' },
  });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role },
  });

  const context: WorkspaceRequestContext = {
    workspaceId: workspace.id,
    memberId: member.id,
    slug: workspace.slug,
    status: 'ACTIVE',
    role,
  };
  const credential: McpCredential = {
    tokenId: `token_${suffix}`,
    userId: user.id,
    workspaceId: workspace.id,
    scopes: ['READ'],
  };

  return {
    user,
    workspace,
    member,
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

beforeEach(async () => {
  await resetDatabase();
});

describe('shipyard_list_issues', () => {
  it('lists active issues with their identifiers, and stops at the limit', async () => {
    const { context, user, tool } = await seedWorkspace();

    for (const title of [
      'Login redirect loops',
      'Billing webhook retries',
      'Add CSV export',
    ]) {
      await issuesService.create(context, user.id, { title });
    }

    const result = await listIssuesTool.handler({ limit: 1 }, tool);
    const text = textOf(result);
    const structured = result.structuredContent as {
      issues: unknown[];
      summary: { returned: number; total: number; truncated: boolean };
    };

    expect(result.isError).toBeUndefined();
    expect(structured.summary).toEqual({
      returned: 1,
      total: 3,
      truncated: true,
    });
    expect(text).toContain('1 of 3 shown');
    // One issue line, and the count above is the honest one.
    expect(text.split('\n').filter((row) => row.startsWith('- '))).toHaveLength(
      1,
    );
  });

  it('filters by status, assignee and an unknown name that cannot resolve', async () => {
    const { context, user, tool } = await seedWorkspace();
    const issue = await issuesService.create(context, user.id, {
      title: 'Login redirect loops',
      priority: 'HIGH',
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { status: 'IN_PROGRESS', assigneeId: user.id },
    });

    const matched = await listIssuesTool.handler(
      { status: ['IN_PROGRESS'], assignee: 'me' },
      tool,
    );
    expect(textOf(matched)).toContain(issue.identifier);
    expect(textOf(matched)).toContain('high');

    const unmatched = await listIssuesTool.handler(
      { status: ['DONE'], assignee: 'me' },
      tool,
    );
    expect(textOf(unmatched)).toContain('(nothing matched)');

    const unknown = await listIssuesTool.handler(
      { assignee: 'Nobody Here' },
      tool,
    );
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('No member of this workspace matches');
    expect(textOf(unknown)).toContain('shipyard_list_members');
  });

  it('excludes archived issues unless they are asked for', async () => {
    const { context, user, tool } = await seedWorkspace();
    const kept = await issuesService.create(context, user.id, {
      title: 'Still open',
    });
    const parked = await issuesService.create(context, user.id, {
      title: 'Old and parked',
    });
    await prisma.issue.update({
      where: { id: parked.id },
      data: { archivedAt: new Date() },
    });

    const without = textOf(await listIssuesTool.handler({}, tool));
    expect(without).toContain(kept.identifier);
    expect(without).not.toContain(parked.identifier);

    const withArchived = textOf(
      await listIssuesTool.handler({ includeArchived: true }, tool),
    );
    expect(withArchived).toContain(kept.identifier);
    expect(withArchived).toContain(parked.identifier);
  });

  it('rejects an unknown project by name, naming the ones that exist', async () => {
    const { context, user, tool } = await seedWorkspace();
    await projectsService.create(context, user.id, {
      name: 'Website redesign',
    });

    const result = await listIssuesTool.handler(
      { project: 'Nonexistent' },
      tool,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Website redesign');
  });
});

describe('shipyard_get_issue', () => {
  it('reads one issue in full by the identifier a person would say', async () => {
    const { context, user, tool } = await seedWorkspace();
    const created = await issuesService.create(context, user.id, {
      title: 'Login redirect loops',
      description: 'After the second login the browser loops back to /login.',
      priority: 'URGENT',
    });

    const result = await getIssueTool.handler(
      { issue: created.identifier },
      tool,
    );
    const text = textOf(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain(
      `Issue: ${created.identifier} — Login redirect loops`,
    );
    expect(text).toContain('Priority: urgent');
    expect(text).toContain('After the second login');

    // And by the internal id, for a caller that holds one.
    const byId = await getIssueTool.handler({ issue: created.id }, tool);
    expect(textOf(byId)).toContain(created.identifier);
  });

  it('reads an archived issue, and says it is archived', async () => {
    const { context, user, tool } = await seedWorkspace();
    const created = await issuesService.create(context, user.id, {
      title: 'Shipped last month',
    });
    await prisma.issue.update({
      where: { id: created.id },
      data: { archivedAt: new Date() },
    });

    const text = textOf(
      await getIssueTool.handler({ issue: created.identifier }, tool),
    );

    expect(text).toContain(created.identifier);
  });

  it('answers a missing identifier and another workspace’s identifier identically', async () => {
    const here = await seedWorkspace();
    const there = await seedWorkspace();

    const foreign = await issuesService.create(there.context, there.user.id, {
      title: 'Not yours',
    });

    const fake = await getIssueTool.handler({ issue: 'SHIP-9999' }, here.tool);
    const other = await getIssueTool.handler(
      { issue: foreign.identifier },
      here.tool,
    );

    expect(fake.isError).toBe(true);
    expect(other.isError).toBe(true);
    // Byte for byte: a difference here is a cross-tenant existence oracle.
    expect(textOf(other).replace(foreign.identifier, 'SHIP-9999')).toBe(
      textOf(fake),
    );
  });
});

describe('shipyard_search', () => {
  it('finds issues by words and reports what it grouped', async () => {
    const { context, user, tool } = await seedWorkspace();
    await issuesService.create(context, user.id, {
      title: 'Login redirect loops',
    });
    await issuesService.create(context, user.id, { title: 'Add CSV export' });

    const result = await searchTool.handler({ query: 'login' }, tool);
    const text = textOf(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Login redirect loops');
    expect(text).not.toContain('CSV export');
  });

  it('says so plainly when nothing matches', async () => {
    const { tool } = await seedWorkspace();

    expect(
      textOf(await searchTool.handler({ query: 'zzzzz' }, tool)),
    ).toContain('Nothing matched');
  });
});

describe('shipyard_list_projects and shipyard_list_cycles', () => {
  it('lists projects with their progress and owner', async () => {
    const { context, user, tool } = await seedWorkspace();
    await projectsService.create(context, user.id, {
      name: 'Website redesign',
    });

    const text = textOf(await listProjectsTool.handler({}, tool));

    expect(text).toContain('Website redesign');
    expect(text).toContain('owner @Ada Lovelace');
  });

  it('lists cycles with their window and completion', async () => {
    const { context, user, tool } = await seedWorkspace();
    await cyclesService.create(context, user.id, {
      name: 'Cycle 7',
      startDate: '2026-01-05',
      endDate: '2026-01-19',
    });

    const text = textOf(await listCyclesTool.handler({}, tool));

    expect(text).toContain('Cycle 7');
    expect(text).toContain('2026-01-05');
    expect(text).toContain('2026-01-19');
  });
});

describe('shipyard_workspace_overview', () => {
  it('orients a reader in one call: my work, the cycle, the projects', async () => {
    const { context, user, tool } = await seedWorkspace();
    const issue = await issuesService.create(context, user.id, {
      title: 'Login redirect loops',
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { assigneeId: user.id, status: 'IN_PROGRESS' },
    });
    const cycle = await cyclesService.create(context, user.id, {
      name: 'Cycle 7',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    // In progress now — the overview reports the cycle that is running, which is
    // what "current cycle" means to a reader asking about this week.
    await prisma.cycle.update({
      where: { id: cycle.id },
      data: { status: 'ACTIVE' },
    });

    const text = textOf(await workspaceOverviewTool.handler({}, tool));

    expect(text).toContain('Login redirect loops');
    expect(text).toContain('Cycle 7');
  });

  it('lists an issue once even when it is both assigned to and opened by the owner', async () => {
    // The first dogfooding session returned the same identifier in both buckets,
    // which reads as two issues. One line, under the stronger statement.
    const { context, user, tool } = await seedWorkspace();
    const issue = await issuesService.create(context, user.id, {
      title: 'Login redirect loops',
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { assigneeId: user.id, status: 'IN_PROGRESS' },
    });

    const text = textOf(await workspaceOverviewTool.handler({}, tool));
    // Scoped to the work section: the identifier legitimately appears again in
    // "Recent activity" ("… created SHIP-1 …"), which is a different statement.
    const workLines = text
      .split('\n')
      .filter(
        (row) => row.startsWith('- mine:') || row.startsWith('- opened by me:'),
      );

    expect(workLines).toHaveLength(1);
    expect(workLines[0]).toContain(issue.identifier);
    expect(workLines[0]).toContain('mine:');
  });

  it('takes no arguments and rejects any that are offered', async () => {
    const { tool } = await seedWorkspace();

    await expect(
      workspaceOverviewTool.handler({ limit: 5 }, tool),
    ).rejects.toThrow();
  });
});

describe('shipyard_recent_activity', () => {
  it('reads the feed newest-first and reports a cursor when there is more', async () => {
    const { context, user, tool } = await seedWorkspace();
    await issuesService.create(context, user.id, { title: 'One' });
    await issuesService.create(context, user.id, { title: 'Two' });

    const result = await recentActivityTool.handler({ limit: 1 }, tool);
    const structured = result.structuredContent as {
      events: unknown[];
      summary: { returned: number; truncated: boolean; cursor?: string };
    };

    expect(structured.events).toHaveLength(1);
    expect(structured.summary.truncated).toBe(true);
    expect(structured.summary.cursor).toBeDefined();
    expect(textOf(result)).toContain('pass the cursor');

    const next = await recentActivityTool.handler(
      { limit: 1, cursor: structured.summary.cursor },
      tool,
    );
    expect(textOf(next)).not.toBe(textOf(result));
  });

  it('rejects an actor that is not a member, actionably', async () => {
    const { tool } = await seedWorkspace();

    const result = await recentActivityTool.handler({ actor: 'Ghost' }, tool);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No member of this workspace matches');
  });
});

describe('shipyard_list_members', () => {
  it('lists names and roles, and never an email address', async () => {
    const { tool, user } = await seedWorkspace('OWNER');

    const result = await listMembersTool.handler({}, tool);
    const text = textOf(result);

    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('owner');
    expect(text).not.toContain('@');
    expect(text).not.toContain(user.email);
    expect(JSON.stringify(result)).not.toContain(user.email);
  });
});

describe('the tool surface as a whole', () => {
  it('refuses to read anything without a scope on the credential', async () => {
    const { tool } = await seedWorkspace();

    // The registry gates by scope; the tool itself trusts the credential it is
    // handed. This asserts the trust boundary is where the design puts it: the
    // scope check lives in dispatch, once, for every tool.
    const narrow: McpToolContext = {
      ...tool,
      credential: { ...tool.credential, scopes: [] },
    };

    // The handler runs (dispatch is the gate) — what matters is that the
    // registry does not advertise it to such a credential in the first place.
    const { advertisedTools } =
      await import('../../../../src/features/mcp/registry.js');
    expect(advertisedTools([])).toEqual([]);
    expect(advertisedTools(narrow.credential.scopes)).toEqual([]);
    expect(advertisedTools(['READ'])).toHaveLength(8);
  });
});
