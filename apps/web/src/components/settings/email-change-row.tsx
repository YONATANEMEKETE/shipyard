'use client';

import { Lock, Mail, MailCheck, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { changeEmailRequestSchema } from '@shipyard/shared';

import { Button } from '@/components/motion/button/base';
import { StatefulButton } from '@/components/motion/button/stateful';
import {
  CONTROL_CLASS,
  FIELD_CLASS_NAMES,
} from '@/components/settings/field-styles';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { resumeHref } from '@/lib/auth/next-redirect';
import { cn } from '@/lib/utils';

/**
 * Email row — three states, because changing an email is not a save.
 *
 * `authClient.changeEmail` mails a confirmation link to the NEW address and
 * changes nothing until it is clicked, so there is no "saved" moment to show.
 * Worse for UX, the API answers an already-registered address with the exact
 * same `{ status: true }` and sends no mail at all (deliberate
 * anti-enumeration). That is why the pending copy is neutral, names the
 * address the link went to, and promises the current address keeps working —
 * and why the only failure the user can provoke inline is retyping their own
 * address.
 *
 * No `<form>` here on purpose: this row sits inside the display-name form, and
 * a nested form is invalid HTML. The send button is `type="button"` and Enter
 * is wired by hand. Validation still runs through the shared contract, so the
 * client rejects exactly what Auth would.
 */

type EmailMode = 'current' | 'editing' | 'pending';

export function EmailChangeRow({ email }: { email: string }) {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [mode, setMode] = useState<EmailMode>('current');
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Better Auth bakes this into the verification link as `callbackURL`, and
   * the verify page pulls the nested `next` back out of it — so confirming
   * lands the user on this card instead of the app root.
   */
  const callbackURL = resumeHref(
    '/verify-email',
    `/w/${slug}/settings/account`,
  );

  /** Sends the link. Returns a failure message, or null when it went out. */
  const send = async (newEmail: string): Promise<string | null> => {
    const { error } = await authClient.changeEmail({ newEmail, callbackURL });
    if (error) {
      return error.message ?? 'We could not send the confirmation link.';
    }

    setPendingEmail(newEmail);
    setMode('pending');
    return null;
  };

  const submitDraft = async () => {
    // Normalised the way Better Auth stores it, so the pending copy shows
    // exactly the address the link was sent to.
    const candidate = draft.trim().toLowerCase();

    const parsed = changeEmailRequestSchema.safeParse({ newEmail: candidate });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter a valid email');
      return;
    }
    if (candidate === email.toLowerCase()) {
      // The API rejects this too, but checking here saves the round trip and
      // reads better than its "Email is the same".
      setFieldError('That is already your email');
      return;
    }

    setFieldError(null);
    setBusy(true);
    try {
      const problem = await send(candidate);
      if (problem) setFieldError(problem);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setPendingError(null);
    setBusy(true);
    try {
      setPendingError(await send(pendingEmail));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setDraft('');
    setFieldError(null);
    setMode('editing');
  };

  const backToEditing = () => {
    // Carry the address forward: the usual reason to come back here is a typo
    // in the one that was just sent.
    setDraft(pendingEmail);
    setPendingError(null);
    setMode('editing');
  };

  // ── Pending ──

  if (mode === 'pending') {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {/* Stacks below `sm`: 'Use a different address' beside a resend button
            needs more width than a phone has, and a squeezed pair reads worse
            than two lines. */}
        <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-end">
          <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-1">
            <span className="px-1 text-[11px] font-semibold text-foreground">
              Email
            </span>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-ds-border bg-ds-bg px-3.5">
              <MailCheck className="size-[15px] shrink-0 text-muted-foreground" />
              <span className="truncate text-xs text-foreground">
                {pendingEmail}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] font-bold tracking-[1px] text-muted-foreground uppercase">
                Pending
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <StatefulButton
              type="button"
              variant="ghost"
              disabled={busy}
              state={busy ? 'loading' : 'idle'}
              loadingText="Resending…"
              onClick={() => void resend()}
              className={`${CONTROL_CLASS} text-foreground`}
            >
              Resend link
            </StatefulButton>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={backToEditing}
              className={`${CONTROL_CLASS} text-foreground`}
            >
              Use a different address
            </Button>
          </div>
        </div>

        <span
          aria-live="polite"
          className={cn(
            'px-1 text-[11px] leading-[1.45]',
            pendingError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {pendingError ??
            `We sent a confirmation link to ${pendingEmail}. Your email stays ${email} until you confirm.`}
        </span>
      </div>
    );
  }

  // ── Editing ──

  if (mode === 'editing') {
    return (
      <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-end">
        <Input
          label="New email"
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (fieldError) setFieldError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Own the submit so Enter here can never reach the name form
            // wrapped around this row.
            event.preventDefault();
            void submitDraft();
          }}
          error={fieldError ?? undefined}
          disabled={busy}
          autoFocus
          className="w-full sm:min-w-0 sm:flex-1"
          leftIcon={<Mail className="size-[15px]" />}
          classNames={FIELD_CLASS_NAMES}
        />

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft('');
              setFieldError(null);
              setMode('current');
            }}
            className={`${CONTROL_CLASS} text-foreground`}
          >
            Cancel
          </Button>
          <StatefulButton
            type="button"
            disabled={busy}
            state={busy ? 'loading' : 'idle'}
            loadingText="Sending…"
            icon={<Mail className="size-[15px]" />}
            onClick={() => void submitDraft()}
            className={`${CONTROL_CLASS} bg-ds-brand text-white hover:bg-ds-brand/90`}
          >
            Send confirmation link
          </StatefulButton>
        </div>
      </div>
    );
  }

  // ── Current ──

  return (
    <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-end">
      <Input
        label="Email"
        value={email}
        readOnly
        className="w-full sm:min-w-0 sm:flex-1"
        leftIcon={<Lock className="size-[15px]" />}
        classNames={FIELD_CLASS_NAMES}
      />
      <Button
        type="button"
        variant="ghost"
        onClick={startEditing}
        className={`${CONTROL_CLASS} shrink-0 text-foreground`}
      >
        <Pencil className="size-[15px]" />
        Change email
      </Button>
    </div>
  );
}
