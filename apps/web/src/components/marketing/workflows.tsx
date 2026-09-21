import { Container } from '@/components/marketing/container';
import { Marks, TOP_CORNERS } from '@/components/marketing/marks';
import {
  TILE,
  TILE_COLUMNS,
  TILE_FILL,
  TILE_MASK,
} from '@/components/marketing/tiles';

/**
 * The workflows section: what the product does, three cards deep.
 *
 * Anatomy follows the same layout study as the hero: one panel carrying the
 * section's heading and a short paragraph, with the tile field filling its right
 * side behind a hairline, and a row of three cards beneath it. The reference puts
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

/** A progress bar using the product's own track and fill tokens. */
function Progress({ value }: { value: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-ds-border">
      <span
        className="block h-full rounded-full bg-ds-brand"
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

/** Projects: the planning card's visual. */
function ProjectsVisual() {
  const projects = [
    { name: 'Shipyard 1.0', meta: '18 issues', value: 62, state: 'Active' },
    { name: 'Web app', meta: '14 issues', value: 38, state: 'Active' },
    {
      name: 'Design system',
      meta: '12 issues',
      value: 100,
      state: 'Completed',
    },
  ];

  return (
    <div className="space-y-4">
      {projects.map((project) => (
        <div key={project.name} className="space-y-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-foreground">
              {project.name}
            </span>
            <span
              className={
                project.state === 'Completed'
                  ? 'rounded-full bg-ds-success-soft px-2 py-0.5 text-[10px] font-semibold text-ds-success'
                  : 'rounded-full bg-ds-brand-soft px-2 py-0.5 text-[10px] font-semibold text-ds-brand'
              }
            >
              {project.state}
            </span>
          </span>
          <Progress value={project.value} />
          <span className="block text-[11px] leading-none text-ds-text-muted">
            {project.meta}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Cycles: the running card's visual. */
function CycleVisual() {
  return (
    <div className="space-y-4">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Cycle 12</span>
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-ds-text-muted">
          Ends Sep 28
        </span>
      </span>
      <Progress value={44} />
      <span className="flex items-center justify-between gap-2 text-[11px] leading-none text-ds-text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-ds-success" />4
          done
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-ds-brand" />3 in
          progress
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-ds-danger" />1
          blocked
        </span>
      </span>
    </div>
  );
}

/** Activity: the collaboration card's visual. */
const ACTIVITY = [
  {
    initials: 'YM',
    tone: 'bg-ds-brand',
    actor: 'Yonatane M.',
    action: 'commented on',
    subject: 'Activity feed shows duplicate entries',
    when: '2h',
  },
  {
    initials: 'Y5',
    tone: 'bg-ds-info',
    actor: 'Yonatanem 55',
    action: 'moved to In progress',
    subject: 'Optimistic updates for drag and drop',
    when: '6h',
  },
  {
    initials: 'Y2',
    tone: 'bg-ds-success',
    actor: 'YONATANEM 2025',
    action: 'opened',
    subject: 'Keyboard shortcuts for the board',
    when: '1d',
  },
];

function ActivityVisual() {
  return (
    <div className="space-y-3">
      {ACTIVITY.map((row) => (
        <div key={row.subject} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className={`grid size-5 shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white ${row.tone}`}
          >
            {row.initials}
          </span>
          <span className="min-w-0 flex-1 text-xs leading-5 text-ds-text-muted">
            <span className="font-medium text-foreground">{row.actor}</span>{' '}
            {row.action}{' '}
            <span className="font-medium text-foreground">{row.subject}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] leading-5 text-ds-text-muted">
            {row.when}
          </span>
        </div>
      ))}
    </div>
  );
}

const CARDS = [
  {
    eyebrow: 'Plan',
    heading: 'Projects that hold the whole picture',
    body: 'A project is a page for one objective: the issues inside it, an owner, and a lifecycle of its own, from planned to active to completed, without a second tool to keep in step.',
    visual: <ProjectsVisual />,
  },
  {
    eyebrow: 'Run',
    heading: 'Cycles that keep the pace honest',
    body: 'Time-boxed cycles whose progress comes from the work itself, with nothing to update by hand and nothing to reconcile.',
    visual: <CycleVisual />,
  },
  {
    eyebrow: 'Collaborate',
    heading: 'Every change has a name on it',
    body: 'Comments, mentions and an activity feed that reads like a changelog: who moved what, and when.',
    visual: <ActivityVisual />,
  },
];

/**
 * The crossings at the panel's top corners.
 *
 * The panel's hairline does not turn there: the top rule runs on past the two
 * corners and the side rules rise above it, so each pair crosses exactly where a
 * plus mark sits: the crossing is drawn, not only marked. The arms are one pixel
 * thick like every other hairline and the same colour, so they read as the same
 * line continuing.
 *
 * They are offset by one pixel (`-top-px`, `-left-px`) because an absolutely
 * positioned box inside a bordered parent is placed against the padding box,
 * which begins just *inside* the border. Without the offset each arm would sit a
 * pixel beside the line it continues and the two would read as a step. The arms
 * are 12px, which stays inside the container's gutter at every breakpoint
 * (16 / 24 / 32px), so they never reach the page's own edge.
 */
function TopCrossings() {
  return (
    <>
      {/* The top rule, running on past the left and right corners. */}
      <span
        aria-hidden
        className="absolute -top-px -left-3 h-px w-3 bg-ds-border"
      />
      <span
        aria-hidden
        className="absolute -top-px -right-3 h-px w-3 bg-ds-border"
      />
      {/* The side rules, rising above it. */}
      <span
        aria-hidden
        className="absolute -top-3 -left-px h-3 w-px bg-ds-border"
      />
      <span
        aria-hidden
        className="absolute -top-3 -right-px h-3 w-px bg-ds-border"
      />
    </>
  );
}

export function Workflows() {
  return (
    <section className="border-b border-ds-border">
      {/* The top of this section sits close under the hero's product band: the
          band already closes with its own padding, so the section's top space is
          a third of the bottom's, so the panel reads as the next thing on the page
          rather than a new page. */}
      <Container className="pt-10 pb-20 sm:pt-12 sm:pb-28">
        {/* The intro panel: copy on the left, the tile field filling the right
            side behind a hairline. It carries a hairline and square corners but
            no surface of its own: it sits directly on the page background, so
            the section reads as one plane the rules are drawn on. The same plus
            marks that cross the hero's lines pin the panel's top two corners;
            nothing clips here, so each mark keeps the half that sits outside. */}
        <div className="relative grid border border-ds-border lg:grid-cols-[1fr_minmax(280px,38%)]">
          <TopCrossings />
          <Marks corners={TOP_CORNERS} />

          <div className="p-8 sm:p-10">
            <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
              The workflows
            </p>
            <h2 className="mt-3 max-w-[520px] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              The whole loop, in <span className="text-ds-brand">one</span>{' '}
              workspace
            </h2>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-ds-text-muted">
              Issues, projects, cycles and activity are one model. Progress on a
              project and on a cycle is derived from the issues inside it, so
              planning, doing and reporting all read from the same data.
            </p>
          </div>

          <div
            aria-hidden
            className="relative min-h-[180px] border-l border-ds-border"
            style={{
              backgroundColor: TILE_FILL,
              maskImage: TILE_MASK,
              maskSize: `${TILE * TILE_COLUMNS}px ${TILE * TILE_COLUMNS}px`,
            }}
          />
        </div>

        {/* The bottom part of the composition: the panel's own bottom rule is
            its top edge, the one line the two parts share, so the frame is
            drawn on the other three sides only.

            Inside are three equal sections, told apart by one rule each (a left
            border on every section but the first) and by nothing else: no card,
            no surface, no radius. Each section splits in two: the copy on top
            under its own rule, which spans the section edge to edge, and the
            product's own UI in the space below. On a narrow screen the sections
            stack, so the same rule moves to the top edge instead.

            The split is a two-row subgrid: the frame owns the rows, each section
            spans both, and every section's copy therefore sits in the same row 1.
            The row is as tall as the longest copy, not as tall as each section's
            own, which is what keeps the rule under the copy on one straight
            line across all three instead of stepping down with the text. */}
        <div className="border-x border-b border-ds-border">
          <div className="grid md:grid-cols-3 md:grid-rows-[auto_auto]">
            {CARDS.map((card) => (
              <div
                key={card.eyebrow}
                className="flex flex-col border-t border-ds-border first:border-t-0 md:row-span-2 md:grid md:grid-rows-subgrid md:border-t-0 md:border-l md:first:border-l-0"
              >
                <div className="border-b border-ds-border p-6">
                  <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
                    {card.eyebrow}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                    {card.heading}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ds-text-muted">
                    {card.body}
                  </p>
                </div>

                <div className="flex-1 p-6">
                  {/* The card's own UI is its visual: a panel on the page's own
                      background so it reads as a screen, not as another card. */}
                  <div className="rounded-lg border border-ds-border bg-ds-bg p-4">
                    {card.visual}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
