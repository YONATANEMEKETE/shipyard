import { Anchor, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

const nav = ['Overview', 'Projects', 'Pricing', 'Docs'];

const swatches = [
  { name: 'ds-bg', value: '#F4F3EF', className: 'bg-ds-bg' },
  {
    name: 'ds-surface',
    value: '#FFFFFF',
    className: 'bg-ds-surface border border-ds-border',
  },
  { name: 'ds-brand', value: '#B45309', className: 'bg-ds-brand' },
  { name: 'ds-accent', value: '#F59E0B', className: 'bg-ds-accent' },
  {
    name: 'ds-brand-soft',
    value: '#FFF4DB',
    className: 'bg-ds-brand-soft border border-ds-border',
  },
  { name: 'ds-text', value: '#171717', className: 'bg-ds-text' },
  { name: 'ds-text-muted', value: '#6C6861', className: 'bg-ds-text-muted' },
  {
    name: 'ds-border-strong',
    value: '#B9B5AC',
    className: 'bg-ds-border-strong',
  },
  { name: 'ds-success', value: '#2E7D5B', className: 'bg-ds-success' },
  { name: 'ds-warning', value: '#A65F00', className: 'bg-ds-warning' },
  { name: 'ds-danger', value: '#B42318', className: 'bg-ds-danger' },
  { name: 'ds-info', value: '#2563EB', className: 'bg-ds-info' },
];

const typeRows = [
  {
    label: 'Display',
    className: 'text-[40px] leading-[1.08] tracking-[-0.8px] font-bold',
    sample: 'Product moments, hero moments',
  },
  {
    label: 'Heading 1',
    className: 'text-[32px] leading-[1.15] tracking-[-0.8px] font-semibold',
    sample: 'Page title',
  },
  {
    label: 'Heading 2',
    className: 'text-2xl leading-[1.2] tracking-[-0.8px] font-semibold',
    sample: 'Major page section',
  },
  {
    label: 'Heading 3',
    className: 'text-xl leading-[1.25] font-semibold',
    sample: 'Card or panel heading',
  },
  {
    label: 'Body',
    className: 'text-sm leading-[1.5]',
    sample: 'Default product copy at 14px / 1.5 line height.',
  },
  {
    label: 'Small',
    className: 'text-xs leading-[1.5] text-ds-text-muted',
    sample: 'Supporting text and metadata',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-ds-brand text-primary-foreground">
              <Anchor className="size-4" aria-hidden />
            </span>
            <span
              className="text-lg font-bold tracking-[-0.8px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Shipyard
            </span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            {nav.map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm text-ds-text-muted transition-colors hover:text-foreground"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm">Get started</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8">
        {/* Hero */}
        <section className="flex flex-col items-start gap-8 py-24">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
            Plan · Build · Ship
          </span>
          <h1 className="max-w-3xl text-[40px] font-bold leading-[1.08] tracking-[-0.8px]">
            The project machine
            <br />
            your team{' '}
            <span className="text-ds-brand">actually ships with.</span>
          </h1>
          <p className="max-w-2xl text-base leading-[1.5] text-ds-text-muted">
            Shipyard is a focused project-management workspace. Dense but
            readable, calm but precise — one main action per section, warm amber
            only where it matters.
          </p>
          <form className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                type="email"
                id="work-email"
                placeholder="you@company.com"
                aria-label="Work email"
              />
            </div>
            <Button type="submit">
              Create workspace
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
          <p className="font-mono text-[11px] text-ds-text-muted">
            Inter / Geist Mono · Harbor Amber #B45309 · 4px spacing rhythm
          </p>
        </section>

        {/* Brand palette */}
        <section className="flex flex-col gap-6 pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Brand palette</h2>
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-ds-text-muted">
              ds-* tokens
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map((s) => (
              <Card key={s.name} className="gap-3 p-4">
                <div className={`h-16 w-full rounded-lg ${s.className}`} />
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs font-medium">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] text-ds-text-muted">
                    {s.value}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Type scale */}
        <section className="flex flex-col gap-6 pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Type scale</h2>
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-ds-text-muted">
              Inter · −0.8px heads
            </span>
          </div>
          <Card className="divide-y divide-border gap-0 p-0">
            {typeRows.map((t) => (
              <div
                key={t.label}
                className="grid grid-cols-1 items-baseline gap-2 px-6 py-4 sm:grid-cols-[140px_1fr] sm:gap-8"
              >
                <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-ds-text-muted">
                  {t.label}
                </span>
                <span className={t.className}>{t.sample}</span>
              </div>
            ))}
          </Card>
        </section>

        {/* Controls */}
        <section className="flex flex-col gap-6 pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Controls</h2>
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-ds-text-muted">
              Buttons · Inputs
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="grid max-w-xl grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Project name
              </label>
              <Input id="name" placeholder="e.g. Q3 Platform Migration" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Work email
              </label>
              <Input id="email" type="email" defaultValue="you@company.com" />
            </div>
          </div>
        </section>

        {/* Statuses */}
        <section className="flex flex-col gap-6 pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Status</h2>
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-ds-text-muted">
              Meaning beyond color
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="text-ds-success">
              <span
                className="size-1.5 rounded-full bg-ds-success"
                aria-hidden
              />
              On track
            </Badge>
            <Badge variant="outline" className="text-ds-warning">
              <span
                className="size-1.5 rounded-full bg-ds-warning"
                aria-hidden
              />
              At risk
            </Badge>
            <Badge variant="outline" className="text-ds-danger">
              <span
                className="size-1.5 rounded-full bg-ds-danger"
                aria-hidden
              />
              Blocked
            </Badge>
            <Badge variant="outline" className="text-ds-info">
              <span className="size-1.5 rounded-full bg-ds-info" aria-hidden />
              Planned
            </Badge>
            <Badge>Active filter</Badge>
            <Badge variant="secondary">Neutral</Badge>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-8 py-10 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-[11px] text-ds-text-muted">
            Shipyard · Harbor Amber theme · Inter + Geist Mono
          </span>
          <span className="font-mono text-[11px] text-ds-text-muted">
            Plan. Build. Ship.
          </span>
        </div>
      </footer>
    </div>
  );
}
