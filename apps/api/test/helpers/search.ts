import { prisma } from '../../src/common/db/client.js';

/**
 * Search integration-test seeding (F10). Content is created directly through
 * Prisma — the owning CRUD modules have their own suites; these tests target
 * search behavior (ranking, scoping, bounds), not the write paths. IDs are
 * Prisma-generated cuids so rows can flow back through routes that validate
 * cuid params (e.g. posting the mention comment via the comments API).
 *
 * Corpus vocabulary follows api-design §10.1: "checkout" overlaps across an
 * issue title, a project description, a cycle name, and a comment body;
 * "Maya" is both a member name and a comment mention. An archived subset
 * (issue + its comment) and a second workspace with its own "checkout" row
 * power the exclusion/leak assertions.
 */

export const TERM = 'checkout';

export interface CorpusIds {
  workspaceId: string;
  slug: string;
  ownerUserId: string;
  mayaUserId: string;
  mayaMemberId: string;
  projectHitId: string;
  issueHitId: string;
  issueBodyHitId: string;
  issueArchivedId: string;
  cycleHitId: string;
  commentHitId: string; // posted via API (mention resolution) — set by caller
  commentArchivedId: string;
  /** Second workspace — matching content that must never surface. */
  otherWorkspaceId: string;
  otherSlug: string;
  otherIssueId: string;
}

export async function seedSearchCorpus(
  ownerUserId: string,
): Promise<CorpusIds> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const now = new Date();

  const workspace = await prisma.workspace.create({
    data: {
      name: `Search WS ${suffix}`,
      slug: `search-ws-${suffix}`,
      updatedAt: now,
      members: {
        create: {
          userId: ownerUserId,
          role: 'OWNER',
          createdAt: now,
        },
      },
    },
  });

  const maya = await prisma.user.create({
    data: {
      id: `sm-maya-${suffix}`,
      name: 'Maya Chen',
      email: `maya-${suffix}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  const mayaMember = await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: maya.id,
      role: 'MEMBER',
      createdAt: now,
    },
  });
  const bob = await prisma.user.create({
    data: {
      id: `sm-bob-${suffix}`,
      name: 'Bob',
      email: `bob-${suffix}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: bob.id,
      role: 'MEMBER',
      createdAt: now,
    },
  });

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: 'Checkout revamp',
      description: 'Make checkout payments great',
      ownerId: ownerUserId,
      updatedAt: now,
    },
  });

  const issueHit = await prisma.issue.create({
    data: {
      workspaceId: workspace.id,
      seqNumber: 24,
      title: 'Fix checkout redirect',
      creatorId: ownerUserId,
      updatedAt: now,
    },
  });
  const issueBody = await prisma.issue.create({
    data: {
      workspaceId: workspace.id,
      seqNumber: 25,
      title: 'Unrelated work',
      description: 'talks about the checkout flow',
      creatorId: ownerUserId,
      updatedAt: now,
    },
  });
  const issueArchived = await prisma.issue.create({
    data: {
      workspaceId: workspace.id,
      seqNumber: 26,
      title: 'Archived checkout',
      creatorId: ownerUserId,
      archivedAt: now,
      updatedAt: now,
    },
  });

  const cycle = await prisma.cycle.create({
    data: {
      workspaceId: workspace.id,
      name: 'Checkout sprint',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-14'),
      updatedAt: now,
    },
  });

  const commentArchived = await prisma.comment.create({
    data: {
      workspaceId: workspace.id,
      issueId: issueArchived.id,
      authorId: maya.id,
      content: 'checkout frozen discussion',
      createdAt: now,
      updatedAt: now,
    },
  });

  const other = await prisma.workspace.create({
    data: {
      name: `Other WS ${suffix}`,
      slug: `other-ws-${suffix}`,
      updatedAt: now,
      members: {
        create: {
          userId: maya.id,
          role: 'OWNER',
          createdAt: now,
        },
      },
    },
  });
  const otherIssue = await prisma.issue.create({
    data: {
      workspaceId: other.id,
      seqNumber: 1,
      title: 'checkout elsewhere',
      creatorId: maya.id,
      updatedAt: now,
    },
  });

  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    ownerUserId,
    mayaUserId: maya.id,
    mayaMemberId: mayaMember.id,
    projectHitId: project.id,
    issueHitId: issueHit.id,
    issueBodyHitId: issueBody.id,
    issueArchivedId: issueArchived.id,
    cycleHitId: cycle.id,
    commentHitId: '',
    commentArchivedId: commentArchived.id,
    otherWorkspaceId: other.id,
    otherSlug: other.slug,
    otherIssueId: otherIssue.id,
  };
}

/** Bulk-seeds `count` extra matching issues for bound assertions. */
export async function seedBulkIssues(
  workspaceId: string,
  creatorId: string,
  count: number,
): Promise<void> {
  const now = new Date();
  await prisma.issue.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      workspaceId,
      seqNumber: 1000 + index,
      title: `bulk padding number ${index}`,
      creatorId,
      updatedAt: now,
    })),
  });
}

export function searchUrl(slug: string): string {
  return `/api/v1/workspaces/${slug}/search`;
}
