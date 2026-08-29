'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Calendar,
  CircleCheck,
  Ellipsis,
  Folder,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/ease';
import { useThemeToggle } from '@/components/motion/theme-toggle';
import { Switch } from '@/components/ui/switch';
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '', icon: LayoutDashboard },
  { label: 'Issues', href: '/issues', icon: CircleCheck },
  { label: 'Projects', href: '/projects', icon: Folder },
  { label: 'Cycles', href: '/cycles', icon: Calendar },
  { label: 'Members', href: '/members', icon: Users },
  { label: 'Notifications', href: '/notifications', icon: Bell, badge: 3 },
  { label: 'Workspace Settings', href: '/settings', icon: Settings },
];

function SidebarContent({ slug }: { slug: string }) {
  const pathname = usePathname();
  const { isDark, toggle } = useThemeToggle({
    variant: 'rectangle',
    start: 'bottom-up',
  });
  const basePath = `/w/${slug}`;
  const isActive = (href: string) =>
    href === ''
      ? pathname === basePath
      : pathname.startsWith(`${basePath}${href}`);

  return (
    <>
      {/* Brand row */}
      <div className="flex h-[42px] items-center gap-2.5 px-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/app-icon.png"
          alt=""
          aria-hidden
          className="size-[34px] shrink-0 rounded-lg"
        />
        <span
          className="text-[18px] font-extrabold tracking-[-0.5px] text-foreground"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          Shipyard
        </span>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher slug={slug} />

      {/* Navigation — items are width-fit pills with a resting ds-sidebar
          fill; the active item lifts onto a white surface with a border. */}
      <nav className="flex flex-col items-start gap-1.25 border-t border-ds-border pt-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={`${basePath}${item.href}`}
              className={cn(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors',
                active
                  ? 'border border-ds-border bg-ds-surface font-semibold text-foreground shadow-sm dark:bg-ds-sidebar-dark'
                  : 'bg-ds-sidebar font-medium text-foreground/80 hover:bg-ds-border/60 hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-ds-accent px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Spacer pushes footer down */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex flex-col gap-1.25">
        <Switch
          label="Dark mode"
          checked={isDark}
          onToggle={toggle}
          className="rounded-lg bg-ds-sidebar transition-colors hover:bg-ds-border/60"
        />
        <div className="h-px w-full bg-ds-border" />
        <button
          type="button"
          className="flex h-[50px] items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-accent"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[9px] font-bold text-white">
            MC
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[11px] font-semibold text-foreground">
              Maya Chen
            </span>
            <span className="truncate text-[8px] text-muted-foreground">
              Workspace admin
            </span>
          </span>
          <Ellipsis className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        </button>
      </div>
    </>
  );
}

interface WorkspaceSidebarProps {
  slug: string;
  collapsed: boolean;
  onClose: () => void;
}

export function WorkspaceSidebar({
  slug,
  collapsed,
  onClose,
}: WorkspaceSidebarProps) {
  const reduce = useReducedMotion();

  const content = <SidebarContent slug={slug} />;

  // Mobile: fixed sheet with a backdrop; desktop: off-canvas rail.
  return (
    <>
      {/* Desktop rail — negative margin so it slides off-canvas AND releases
          its 252px, letting the header/content columns expand to fill. */}
      <motion.aside
        initial={false}
        animate={{ marginLeft: collapsed ? -252 : 0 }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.28, ease: EASE_OUT }
        }
        aria-hidden={collapsed}
        inert={collapsed}
        className="hidden w-[252px] shrink-0 flex-col gap-2.5 bg-transparent p-3 lg:flex"
      >
        {content}
      </motion.aside>

      {/* Mobile sheet + backdrop */}
      <div className="lg:hidden">
        <AnimatePresence>
          {!collapsed ? (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40"
                onClick={onClose}
                aria-hidden
              />
              <motion.aside
                key="sheet"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.28, ease: EASE_OUT }
                }
                className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col gap-2.5 bg-ds-bg p-3 shadow-xl"
              >
                {content}
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
