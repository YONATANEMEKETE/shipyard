'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ellipsis, LogOut } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { useSession } from '@/hooks/use-session';
import { authClient } from '@/lib/auth-client';
import { EASE_OUT } from '@/lib/ease';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function UserSkeleton() {
  return (
    <div className="flex h-[50px] items-center gap-2.5 rounded-lg px-2">
      <div className="size-8 shrink-0 animate-pulse rounded-full bg-ds-border/60" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3 w-20 animate-pulse rounded bg-ds-border/60" />
        <span className="h-2 w-28 animate-pulse rounded bg-ds-border/40" />
      </span>
    </div>
  );
}

export function UserMenu() {
  const { data, isPending } = useSession();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace('/sign-in');
    } finally {
      setSigningOut(false);
    }
  };

  if (isPending) return <UserSkeleton />;

  const user = data?.user;
  if (!user) return null;

  const avatar = user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.image}
      alt={user.name}
      className="size-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[9px] font-bold text-white">
      {initials(user.name)}
    </span>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[50px] w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-ds-border/60"
      >
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[11px] font-semibold text-foreground">
            {user.name}
          </span>
          <span className="truncate text-[8px] text-muted-foreground">
            {user.email}
          </span>
        </span>
        <Ellipsis className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            role="menu"
            className="absolute bottom-full left-0 right-0 z-50 mb-1.5 rounded-xl border border-ds-border bg-ds-surface p-1.5 shadow-lg"
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              {avatar}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {user.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </div>
            <div className="mx-1 my-1 h-px bg-ds-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 transition-colors hover:bg-ds-sidebar hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
