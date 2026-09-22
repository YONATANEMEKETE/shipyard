import type { DashboardActivityItem, ProjectCard } from '@shipyard/shared';

import {
  CurrentCycleCardBody,
  CurrentCycleCardHeader,
} from '@/components/dashboard/current-cycle-card';
import { ActivityFeedView } from '@/components/dashboard/recent-activity-panel';
import { Container } from '@/components/marketing/container';
import { marketingAsset } from '@/lib/assets';
import { RuledColumns } from '@/components/marketing/ruled-columns';
import { SectionPanel } from '@/components/marketing/section-panel';
import { FadeInWords } from '@/components/motion/fade-in';
import { ProjectKanbanCardView } from '@/components/projects/project-kanban-card';

/**
 * The workflows section: what the product does, three cards deep.
 *
 * Anatomy follows the same layout study as the hero: one panel carrying the
 * section's heading and a short paragraph, with the tile field filling its right
 * side behind a hairline, and a row of three cards beneath it. The panel is
 * `SectionPanel` and the ruled lower half is `RuledColumns`, both shared with
 * the MCP section, so the page's sections cannot drift apart. The reference puts
 * photographs behind those cards; we do not. The card's own UI is the visual,
 * built from the same tokens as the product, so nothing here can drift from what
 * the app actually looks like.
 *
 * The three cards are the parts of the loop the hero's board cannot show on its
 * own: planning, the cycle, and the trail of who changed what. Their numbers are
 * the seeded workspace's own board, not invented metrics.
 *
 * The heading follows the hero's rule: exactly one amber word per composition,
 * on the word the section actually claims (`one`, against the tool sprawl the
 * paragraph then answers). The paragraph states the mechanism rather than the
 * competitor case: the specs in `shipyard-design/04-Engineering/features` derive
 * project and cycle progress from issues and never store it, which is what makes
 * "the same data" true rather than a slogan.
 */

/**
 * The members' faces, shared by the project card and the activity feed so one
 * workspace reads across both.
 *
 * Real photographs from Unsplash (the Unsplash License, which needs no
 * attribution; the photographers are named here anyway), cropped to a face at
 * 48px so an 18px avatar and a 20px row avatar are both sharp on a 2x screen.
 * They stand in for the members of the seeded workspace: nobody in these photos
 * works on Shipyard, and the workspace does not ship its members' pictures.
 */
const FACES = {
  /** Jurica Koletić */
  yonatane:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=48&h=48&q=80&crop=faces',
  /** Michael Dam */
  selam:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=48&h=48&q=80&crop=faces',
  /** Albert Dera */
  dawit:
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=48&h=48&q=80&crop=faces',
  /** Christina @ wocintechchat.com */
  maya: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=48&h=48&q=80&crop=faces',
} as const;

/**
 * Projects: the board's own project card, with sample numbers.
 *
 * Reused rather than redrawn (`components/projects/project-kanban-card.tsx`), so
 * the landing page cannot drift from the board: the owner row, the progress bar
 * and its "N of M issues done" meta, the worker avatar stack and the target date
 * are the product's. The board's own surface is flattened here because this card
 * sits in a ring of its own (see `RINGED`): no hairline, square, on the ring's
 * white. The numbers are the shape a seeded workspace's board has, and the
 * workers are the members with work in it.
 */
const SAMPLE_PROJECT: ProjectCard = {
  id: 'sample-project',
  workspaceId: 'sample-workspace',
  name: 'Shipyard 1.0',
  status: 'ACTIVE',
  owner: {
    memberId: 'sample-member-1',
    userId: 'sample-user-1',
    name: 'Yonatane Mekete',
    email: 'yonatane@example.com',
    image: FACES.yonatane,
  },
  description:
    'Workspaces, projects, cycles, issues and activity: the first release.',
  startDate: '2026-08-18',
  targetDate: '2026-10-15',
  progress: { total: 18, completed: 11, percent: 61 },
  workers: [
    // The owner works on their own project, so the same face is in the stack.
    { userId: 'sample-user-1', name: 'Yonatane M.', image: FACES.yonatane },
    { userId: 'sample-user-2', name: 'Selam T.', image: FACES.selam },
    { userId: 'sample-user-3', name: 'Dawit A.', image: FACES.dawit },
    { userId: 'sample-user-4', name: 'Maya T.', image: FACES.maya },
  ],
  archivedAt: null,
  createdAt: '2026-08-18T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

function ProjectsVisual() {
  return (
    <ProjectKanbanCardView
      project={SAMPLE_PROJECT}
      description={SAMPLE_PROJECT.description}
      className="rounded-none border-0 bg-transparent p-0 shadow-none"
    />
  );
}

/**
 * Cycles: the dashboard's own Current Cycle card, with sample numbers.
 *
 * Reused rather than redrawn (`components/dashboard/current-cycle-card.tsx`), so
 * the landing page cannot drift from the hub: the ring, the legend, the status
 * tones and the date-range format are the product's. The numbers are the shape a
 * seeded workspace's board has, not a live workspace's.
 *
 * The chip is passed rather than derived: the dashboard computes days-left from
 * the real cycle's end date, and a fixed sample date would read "Ended" once it
 * passed.
 */
function CycleVisual() {
  return (
    <div className="flex flex-col gap-3">
      <CurrentCycleCardHeader daysLeft="7 days left" />
      <CurrentCycleCardBody
        name="Cycle 12"
        startDate="2026-09-01"
        endDate="2026-09-28"
        percent={40}
        completed={4}
        total={10}
        statusCounts={{ BACKLOG: 2, TODO: 1, IN_PROGRESS: 3, DONE: 4 }}
      />
    </div>
  );
}

/**
 * Activity: the hub's own Recent Activity feed, with sample events.
 *
 * Reused rather than redrawn: `ActivityFeedView` in
 * `components/dashboard/recent-activity-panel.tsx` is what the rail's panel
 * renders, so the day buckets, the trailing stamps, the spine between the
 * avatars and the row shape are all the product's.
 *
 * The `text` is the composed summary the API stores at emit time, so it is
 * copied from the emitters, not written here: `${actor} moved ${identifier} from
 * ${status} to ${status}` and `${actor} created ${identifier} “${title}”` from
 * `features/issues/service.ts`, `${actor} commented on ${title}` from
 * `features/comments/service.ts`. Statuses are the four the product has
 * (Backlog, Todo, In Progress, Done), and the actor is the member's full name,
 * because that is the name the emitters put in the sentence.
 *
 * The stamps are relative to render time. The feed groups by day, and fixed
 * stamps would fall out of Today and Yesterday within a day or two, leaving the
 * card showing a single stale bucket.
 */
function sampleActivity(): DashboardActivityItem[] {
  const now = Date.now();
  const at = (hoursAgo: number) =>
    new Date(now - hoursAgo * 3_600_000).toISOString();

  return [
    {
      kind: 'COMMENT_CREATED',
      actor: {
        userId: 'sample-user-1',
        name: 'Yonatane Mekete',
        email: 'yonatane@example.com',
        image: FACES.yonatane,
      },
      issue: {
        id: 'sample-issue-1',
        identifier: 'SHIP-142',
        title: 'Activity feed shows duplicate entries',
      },
      workspaceId: 'sample-workspace',
      commentId: 'sample-comment-1',
      text: 'Yonatane Mekete commented on Activity feed shows duplicate entries',
      createdAt: at(2),
    },
    {
      kind: 'ISSUE_STATUS_CHANGED',
      actor: {
        userId: 'sample-user-2',
        name: 'Selam Tesfaye',
        email: 'selam@example.com',
        image: FACES.selam,
      },
      issue: {
        id: 'sample-issue-2',
        identifier: 'SHIP-138',
        title: 'Optimistic updates for drag and drop',
      },
      workspaceId: 'sample-workspace',
      commentId: null,
      text: 'Selam Tesfaye moved SHIP-138 from Todo to In Progress',
      createdAt: at(6),
    },
    {
      kind: 'ISSUE_CREATED',
      actor: {
        userId: 'sample-user-3',
        name: 'Dawit Alemu',
        email: 'dawit@example.com',
        image: FACES.dawit,
      },
      issue: {
        id: 'sample-issue-3',
        identifier: 'SHIP-131',
        title: 'Keyboard shortcuts for the board',
      },
      workspaceId: 'sample-workspace',
      commentId: null,
      text: 'Dawit Alemu created SHIP-131 “Keyboard shortcuts for the board”',
      createdAt: at(28),
    },
  ];
}

function ActivityVisual() {
  return <ActivityFeedView events={sampleActivity()} />;
}

/**
 * The ringed card treatment, shared by all three sections, each of which shows
 * the product's own card (a project, a cycle, the activity feed).
 *
 * The card wears no hairline. Instead it is set in a ring: a band around the
 * card whose fill is a backdrop blur of the photograph, so the picture stays
 * legible right up to the card's edge without a pixel of it landing under the
 * card's own text.
 *
 * The band is the section's own padding, taken one step further: the section
 * area pads by 12px, and the band (a plain padded box inside it) pads by
 * another 12px, so the card lands 24px in and the picture shows 12px sharp, then
 * 12px frosted. Nothing here has a negative margin, so the band cannot reach past
 * the section it is drawn in.
 *
 * Square corners, like the panel above: the product's own cards are square here,
 * and the ring follows them rather than the page's rounded language.
 */
const RINGED = {
  ring: 'min-w-0 p-3 backdrop-blur-sm',
  surface: 'min-w-0 rounded-none bg-ds-surface',
} as const;

const CARDS = [
  {
    eyebrow: 'Plan',
    heading: 'Projects that hold the whole picture',
    body: 'A project is a page for one objective: the issues inside it, an owner, and a lifecycle of its own, from planned to active to completed, without a second tool to keep in step.',
    visual: <ProjectsVisual />,
    ...RINGED,
  },
  {
    eyebrow: 'Run',
    heading: 'Cycles that keep the pace honest',
    body: 'Time-boxed cycles whose progress comes from the work itself, with nothing to update by hand and nothing to reconcile.',
    visual: <CycleVisual />,
    ...RINGED,
  },
  {
    eyebrow: 'Collaborate',
    heading: 'Every change has a name on it',
    body: 'Comments, mentions and an activity feed that reads like a changelog: who moved what, and when.',
    visual: <ActivityVisual />,
    ...RINGED,
  },
];

export function Workflows() {
  return (
    <section className="border-b border-ds-border">
      {/* The section opens on the page's own rhythm, the same top space the
          sections below it take: `pt-20 sm:pt-28` against the MCP section's. The
          hero's band above already closes with its own padding, so this is the
          page's gap, not the band's. */}
      <Container className="py-20 sm:py-28">
        <SectionPanel
          eyebrow={
            <FadeInWords
              text="The workflows"
              inView
              delay={0.05}
              stagger={0.018}
            />
          }
          heading={
            <FadeInWords
              text="The whole loop, in one workspace"
              accent="one"
              accentClassName="text-ds-brand"
              inView
              delay={0.18}
              stagger={0.045}
            />
          }
          body={
            <FadeInWords
              text="Issues, projects, cycles and activity are one model. Progress on a project and on a cycle is derived from the issues inside it, so planning, doing and reporting all read from the same data."
              inView
              delay={0.42}
              stagger={0.02}
            />
          }
        />

        {/* The lower half: the panel's own bottom rule is its top edge, and the
            three columns below carry the product's own cards on the section's
            photograph. 12px of the picture, then the band takes the next 12px:
            see `RINGED` for the card treatment. */}
        <RuledColumns
          columns={CARDS}
          background={marketingAsset('workflow-sections-bg.jpg')}
          curtain
        />
      </Container>
    </section>
  );
}
