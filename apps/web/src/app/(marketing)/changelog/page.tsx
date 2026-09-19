import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'What shipped in Shipyard, release by release, in the order it landed.',
};

/**
 * Changelog — `/changelog`.
 *
 * PLACEHOLDER CONTENT. Designed in `shipyard-design/03-UI/shipyard.pen` before
 * this is styled for real.
 *
 * Entries are hand-written release notes, one object per release, newest first
 * — never generated from commit history, because commits describe the change
 * and release notes describe what a user can now do. The MVP milestones
 * (F0–F13 in the design repository's implementation plan) and the ADRs are the
 * raw material for the first entries.
 */
interface ChangelogEntry {
  /** Release label, e.g. `v0.1.0`. */
  version: string;
  /** ISO date (`YYYY-MM-DD`) so the list can be sorted without a parser. */
  date: string;
  title: string;
  items: string[];
}

const ENTRIES: ChangelogEntry[] = [];

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-ds-text-muted">
        Release notes
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Changelog
      </h1>
      <p className="mt-4 text-sm leading-6 text-ds-text-muted">
        What shipped in Shipyard, release by release, in the order it landed.
      </p>

      {ENTRIES.length === 0 ? (
        <p className="mt-10 rounded-md border border-dashed border-ds-border px-4 py-6 text-sm text-ds-text-muted">
          No releases published yet. Entries appear here as features ship.
        </p>
      ) : (
        <ol className="mt-10 space-y-8">
          {ENTRIES.map((entry) => (
            <li key={entry.version}>
              <div className="flex items-baseline gap-3">
                <h2 className="text-base font-semibold">{entry.title}</h2>
                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-ds-text-muted">
                  {entry.version} · {entry.date}
                </span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ds-text-muted">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
