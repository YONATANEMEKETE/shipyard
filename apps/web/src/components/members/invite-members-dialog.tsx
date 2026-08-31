'use client';

import { Mail, Send, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { StatefulButton } from '@/components/motion/button/stateful';
import { useToast } from '@/components/providers/toast-provider';
import { useInviteMembers } from '@/hooks/use-invitations';
import { Button } from '@/components/ui/button';
import { Input, type InputChip } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type InviteRole = 'MEMBER' | 'ADMIN';

const ROLE_OPTIONS: {
  value: InviteRole;
  title: string;
  description: string;
}[] = [
  { value: 'MEMBER', title: 'Member', description: 'Create & comment' },
  { value: 'ADMIN', title: 'Admin', description: 'Projects & cycles' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  workspaceName: string;
}

/**
 * Invite members dialog — matches "Element / Invite Members Modal" in
 * shipyard.pen: title + subcopy header, chip input for email addresses
 * (Enter commits, Backspace removes the last chip) and a two-card role
 * selector with Member preselected. Send posts the chips + role to
 * useInviteMembers (single batch call), toasts on result and closes on
 * success; on error the chips stay intact for fixing.
 *
 * Content is keyed by open state so it remounts fresh on every open (the
 * emails/role/error reset without effect-based setState).
 */
export function InviteMembersDialog({
  open,
  onOpenChange,
  slug,
  workspaceName,
}: InviteMembersDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <InviteMembersDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          workspaceName={workspaceName}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function InviteMembersDialogContent({
  slug,
  workspaceName,
  onOpenChange,
}: {
  slug: string;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const inviteMutation = useInviteMembers(slug, {
    onSuccess: (data) => {
      const count = data.invitations.length;
      showToast({
        status: 'success',
        title: 'Invitations sent',
        description:
          count === 1 ? '1 invitation sent.' : `${count} invitations sent.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to send invitations',
        description: error.message,
      });
    },
  });

  const [emails, setEmails] = useState<InputChip[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | boolean>(false);
  const [role, setRole] = useState<InviteRole>('MEMBER');

  const addEmail = () => {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (emails.some((chip) => chip.label === email)) {
      setError('This email is already added');
      return;
    }
    setEmails((prev) => [...prev, { id: crypto.randomUUID(), label: email }]);
    setDraft('');
    setError(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addEmail();
    } else if (event.key === 'Backspace' && draft === '' && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  };

  const removeChip = (id: string) => {
    setEmails((prev) => prev.filter((chip) => chip.id !== id));
  };

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border border-ds-border-strong bg-ds-surface p-6 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* Header — title, subcopy, close */}
        <div className="flex w-full items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Invite teammates to {workspaceName}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs leading-[1.55] text-muted-foreground">
              They&apos;ll get an email with a join link valid for 7 days. A
              pending invite grants no access until they accept.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Close"
              className="size-8 shrink-0 rounded-md border-ds-border bg-ds-bg text-muted-foreground hover:bg-ds-border/60 hover:text-foreground"
            >
              <X className="size-[14px]" />
            </Button>
          </DialogPrimitive.Close>
        </div>

        {/* Emails field — chip input */}
        <div className="flex w-full flex-col gap-[7px]">
          <label
            htmlFor="invite-emails"
            className="text-[11px] font-semibold text-foreground"
          >
            Email addresses
          </label>
          <Input
            id="invite-emails"
            value={draft}
            onChange={(value) => {
              setDraft(value);
              if (error) setError(false);
            }}
            onKeyDown={handleKeyDown}
            error={error}
            placeholder="name@company.com"
            autoFocus
            leftIcon={<Mail className="size-[15px] text-muted-foreground" />}
            chips={emails}
            onRemoveChip={removeChip}
            classNames={{
              field:
                'min-h-10 gap-2 rounded-[10px] border-ds-border data-[state=focused]:border-ds-brand data-[state=focused]:ring-2 data-[state=focused]:ring-ds-brand/20',
              input: 'text-sm',
            }}
          />
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            Type an email and hit Enter
          </span>
        </div>

        {/* Role selector — two selectable cards */}
        <div className="flex w-full flex-col gap-[7px]">
          <span className="text-[11px] font-semibold text-foreground">
            Invite as
          </span>
          <div
            role="radiogroup"
            aria-label="Invite role"
            className="flex w-full gap-2.5"
          >
            {ROLE_OPTIONS.map((option) => {
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRole(option.value)}
                  className={cn(
                    'flex h-[52px] flex-1 items-center gap-2.5 rounded-[10px] border px-3 transition-colors',
                    selected
                      ? 'border-ds-brand bg-ds-brand-soft'
                      : 'border-ds-border bg-ds-surface hover:bg-ds-bg',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full',
                      selected
                        ? 'bg-ds-brand'
                        : 'border border-ds-border-strong',
                    )}
                  >
                    {selected ? (
                      <span className="size-1.5 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[1px] text-left">
                    <span className="text-xs font-semibold text-foreground">
                      {option.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer — cancel + send */}
        <div className="flex w-full items-center justify-end gap-2.5">
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-md px-3.5 text-xs font-semibold text-foreground"
            >
              Cancel
            </Button>
          </DialogPrimitive.Close>
          <StatefulButton
            type="button"
            state={inviteMutation.isPending ? 'loading' : 'idle'}
            loadingText="Sending…"
            disabled={emails.length === 0}
            onClick={() =>
              inviteMutation.mutate({
                emails: emails.map((chip) => chip.label),
                role,
              })
            }
            icon={<Send className="size-4" />}
            className="h-9 gap-2 rounded-md bg-ds-brand px-3.5 text-xs font-semibold text-white hover:bg-ds-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send {emails.length}{' '}
            {emails.length === 1 ? 'invitation' : 'invitations'}
          </StatefulButton>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
