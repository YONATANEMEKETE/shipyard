'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  Copy,
  KeyRound,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  mcpTokenLabelSchema,
  mcpTokenScopeSchema,
  type CreateMcpTokenRequest,
  type CreateMcpTokenResponse,
  type McpTokenScope,
  type WorkspaceRole,
} from '@shipyard/shared';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  StatefulButton,
  type ButtonState,
} from '@/components/motion/button/stateful';
import { useToast } from '@/components/providers/toast-provider';
import { useCreateAgentToken } from '@/hooks/use-agent-tokens';
import { cn } from '@/lib/utils';

/**
 * Create-connection dialog (`.pen` has no frame yet — built from the card
 * language: 520px, 26px padding, icon-tile head, 1px dividers between rhythm
 * blocks, right-aligned footer).
 *
 * Two stages in one dialog, because the second stage is not a toast:
 *
 *   1. `form`    — name, permissions, optional expiry. A react-hook-form +
 *                  zod form on the shadcn `Form*` primitives, like every other
 *                  dialog that collects input (create-workspace-dialog is the
 *                  reference: `mode: 'all'`, validation only re-runs on change
 *                  after a submit attempt, `canSubmit` via `safeParse`).
 *   2. `created` — the plaintext token, which exists nowhere else and is never
 *                  returned again (data-model D2). The stage cannot be dismissed
 *                  back into the form: closing it discards the secret the way
 *                  the API intends.
 *
 * The form contract borrows its bounds from `@shipyard/shared` rather than
 * restating them (`mcpTokenLabelSchema`, `mcpTokenScopeSchema`), so the client
 * cannot accept a value the API rejects, and the error sentences are literally
 * the ones the API returns. The only client-only field is `expiry`: a member
 * picks a window, the dialog converts it to the `expiresAt` datetime the
 * request carries.
 *
 * Presentation choices worth keeping:
 * - Permissions are **rows**, not chips: each one carries a label *and* a
 *   sentence about what it unlocks, which is the only way a member can answer
 *   "should I grant this?" without leaving the dialog. Selected rows use the
 *   brand-soft tint (design.md: `ds-brand-soft` = selected rows and tags).
 * - Expiry is a **segmented control on the `ds-sidebar` track**, the same
 *   control the Preferences card uses for view toggles — one segmented idiom in
 *   the product, not two.
 * - The created token sits in a bordered, inset field (`ds-bg` inside the
 *   dialog's `ds-surface`) with the copy action attached to it, so the token
 *   and the thing you do with it are one object. Copying flips the button into
 *   success colours — state, not just a toast that scrolls away.
 * - Stage two speaks to the member, not about the system: it says copy it now
 *   and that a connection can be revoked here. How the credential is stored and
 *   enforced is our business, not theirs.
 * - The dialog **names the workspace** it is minting for — in the subtitle and
 *   again on the reveal stage. The binding comes from the route, so this copy is
 *   the only place the person can check it, and a token whose workspace is a
 *   guess is one they cannot safely paste into an agent.
 * - The submit button's in-flight states are **paced** (`MIN_SPINNER_MS`,
 *   `SUCCESS_HOLD_MS`, `ERROR_HOLD_MS`): the API answers in tens of
 *   milliseconds locally, and a one-frame spinner reads as a glitch rather than
 *   as feedback.
 * - A permission the caller's role cannot grant is **omitted**, not disabled
 *   (F11 rule 6), with one line explaining why. The API enforces the same
 *   ceiling, so this is the surface explaining itself — not a second gate.
 */

const SCOPE_COPY: Record<
  McpTokenScope,
  { label: string; description: string }
> = {
  READ: {
    label: 'Read',
    description:
      'Find and read issues, projects, cycles, members and activity.',
  },
  ISSUES_WRITE: {
    label: 'Edit issues',
    description: 'Create issues, change status, assign, block and comment.',
  },
  COMMENTS_WRITE: {
    label: 'Comment',
    description: 'Add comments to issues.',
  },
  ISSUES_DELETE: {
    label: 'Delete issues',
    description: 'Archive, restore and permanently delete issues.',
  },
};

const SCOPE_ORDER: McpTokenScope[] = [
  'READ',
  'ISSUES_WRITE',
  'COMMENTS_WRITE',
  'ISSUES_DELETE',
];

const EXPIRY_CHOICES = ['never', '30d', '90d'] as const;
type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

const EXPIRY_OPTIONS: readonly {
  value: ExpiryChoice;
  label: string;
  days: number | null;
}[] = [
  { value: 'never', label: 'Never', days: null },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

// Feedback pacing. The mutation owns the request; these two beats belong to the
// dialog, because the API answers in tens of milliseconds locally (and
// sub-second in production): a spinner that appears for a single frame reads as
// a glitch rather than as feedback, and the success tick is worth seeing before
// the stage swaps.
const MIN_SPINNER_MS = 500;
const SUCCESS_HOLD_MS = 700;

// The dialog's own form contract: the request shape plus the expiry choice.
// Label and scope rules are imported, not restated — see the file header.
const createConnectionFormSchema = z.object({
  label: mcpTokenLabelSchema,
  scopes: z.array(mcpTokenScopeSchema).min(1, 'Choose at least one permission'),
  expiry: z.enum(EXPIRY_CHOICES),
});

type CreateConnectionFormValues = z.infer<typeof createConnectionFormSchema>;

/** Owner and Admin share the elevated scope ceiling (data-model §3). */
function canAdminister(role: WorkspaceRole | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function allowedScopes(role: WorkspaceRole | null): McpTokenScope[] {
  return SCOPE_ORDER.filter(
    (scope) => scope !== 'ISSUES_DELETE' || canAdminister(role),
  );
}

/** `null` means "no expiry" — the request field is optional and nullable. */
function expiryToIso(choice: ExpiryChoice): string | null {
  const option = EXPIRY_OPTIONS.find((entry) => entry.value === choice);
  if (!option?.days) return null;
  return new Date(Date.now() + option.days * 24 * 60 * 60 * 1000).toISOString();
}

interface CreateAgentTokenDialogProps {
  slug: string;
  role: WorkspaceRole | null;
  /** The workspace the credential will be bound to — named in the copy so the
   *  person never has to guess which workspace the token they just copied is
   *  for (it comes from the route, never from a field in this form). */
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentTokenDialog({
  slug,
  role,
  workspaceName,
  open,
  onOpenChange,
}: CreateAgentTokenDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Remount per open: the form, the expiry choice and the revealed
            secret all reset, and the secret never survives a close. */}
        <CreateAgentTokenDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          role={role}
          workspaceName={workspaceName}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The 1px rhythm divider the dialog uses between blocks. */
function Divider() {
  return <span aria-hidden className="h-px w-full shrink-0 bg-ds-border" />;
}

function CreateAgentTokenDialogContent({
  slug,
  role,
  workspaceName,
  onOpenChange,
}: {
  slug: string;
  role: WorkspaceRole | null;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const options = allowedScopes(role);
  const deleteOmitted = options.length < SCOPE_ORDER.length;

  const [created, setCreated] = useState<CreateMcpTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  // The one beat the mutation cannot express: "the request succeeded, but hold
  // the success tick for a moment before swapping stages".
  const [showingSuccess, setShowingSuccess] = useState(false);

  const form = useForm<CreateConnectionFormValues>({
    resolver: zodResolver(createConnectionFormSchema),
    // `all` so a blur validates, plus the `shouldValidate` override below so
    // typing does not nag before the first submit attempt.
    mode: 'all',
    defaultValues: {
      label: '',
      scopes: ['READ'],
      expiry: 'never',
    },
  });

  const values = useWatch({ control: form.control });
  const canSubmit = createConnectionFormSchema.safeParse(values).success;

  const createToken = useCreateAgentToken(slug, {
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create the connection',
        description: error.message,
      });
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => form.setFocus('label'), 50);
    return () => clearTimeout(timer);
  }, [form]);

  // Beat one: once the request has landed, keep the tick on the button for at
  // least `MIN_SPINNER_MS` so a fast answer still reads as feedback. Both
  // effects clean their timer up, so an unmount cannot land a state update on a
  // dialog that is already gone.
  useEffect(() => {
    if (!createToken.isSuccess) return;
    const timer = window.setTimeout(
      () => setShowingSuccess(true),
      MIN_SPINNER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [createToken.isSuccess]);

  // Beat two: show the success tick, then swap to the reveal stage. The
  // plaintext exists only in `createToken.data` — never toasted, never logged,
  // never written to the query cache (see the hook).
  useEffect(() => {
    if (!showingSuccess || !createToken.data) return;
    const timer = window.setTimeout(
      () => setCreated(createToken.data ?? null),
      SUCCESS_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [showingSuccess, createToken.data]);

  const onSubmit = form.handleSubmit((vals) => {
    createToken.mutate({
      label: vals.label,
      scopes: vals.scopes,
      expiresAt: expiryToIso(vals.expiry),
    } satisfies CreateMcpTokenRequest);
  });

  // Loading and error come straight from the mutation, so the button can never
  // disagree with the request it represents; only `success` needs the paced
  // beat above. `error` stays on the button (with "Try again") until the next
  // attempt, which keeps the retry enabled instead of disabling the way out.
  const buttonState: ButtonState = createToken.isPending
    ? 'loading'
    : showingSuccess
      ? 'success'
      : createToken.isError
        ? 'error'
        : 'idle';
  const busy = createToken.isPending || showingSuccess;

  const copyToken = () => {
    if (!created) return;
    void navigator.clipboard.writeText(created.token).then(() => {
      setCopied(true);
      showToast({ status: 'success', title: 'Token copied' });
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl border border-ds-border bg-ds-surface p-[26px] shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* ── Head ─────────────────────────────────────────────────────── */}
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-brand/30 bg-ds-brand-soft"
          >
            <KeyRound className="size-[22px] text-ds-brand" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              {created ? 'Copy your token' : 'New agent connection'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="truncate font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.8px] text-muted-foreground">
              {created
                ? 'Shown once — you cannot see it again'
                : `Acts as you in ${workspaceName} only`}
            </DialogPrimitive.Description>
          </div>
          {created ? null : (
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Close"
                className="size-9 shrink-0 rounded-md border-ds-border bg-ds-surface text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-[15px]" />
              </Button>
            </DialogPrimitive.Close>
          )}
        </div>

        <Divider />

        {created ? (
          <>
            {/* ── Stage two: the one and only reveal ─────────────────────── */}
            <div className="flex items-start gap-2.5 rounded-lg border border-ds-warning/30 bg-ds-warning-soft px-3 py-2.5">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-[15px] shrink-0 text-ds-warning"
              />
              <p className="text-[12px] leading-[1.5] text-foreground">
                Copy this token now — this is the only time it is shown.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="px-1 font-mono text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
                {created.label}
              </span>
              <div className="flex items-center gap-2 rounded-lg border border-ds-border-strong bg-ds-bg py-2 pl-3 pr-2 focus-within:border-ds-brand/50">
                <code className="min-w-0 flex-1 select-all break-all font-mono text-[11px] leading-[1.6] text-foreground">
                  {created.token}
                </code>
                <button
                  type="button"
                  onClick={copyToken}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors',
                    copied
                      ? 'border-ds-success/40 bg-ds-success-soft text-ds-success'
                      : 'border-ds-border bg-ds-surface text-foreground hover:bg-ds-surface-subtle',
                  )}
                >
                  {copied ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : (
                    <Copy aria-hidden className="size-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <ul className="flex flex-col gap-1.5 px-1">
              <li className="text-[11px] leading-[1.5] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  What it can do
                </span>{' '}
                —{' '}
                {created.scopes
                  .map((scope) => SCOPE_COPY[scope].label.toLowerCase())
                  .join(', ')}
                .
              </li>
              <li className="text-[11px] leading-[1.5] text-muted-foreground">
                Works in {workspaceName} only. You can revoke it any time from
                this page.
              </li>
            </ul>

            <Divider />

            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
              >
                Done
              </Button>
            </div>
          </>
        ) : (
          /* ── Stage one: the form ─────────────────────────────────────── */
          <Form {...form}>
            <form
              onSubmit={onSubmit}
              noValidate
              className="flex flex-col gap-5"
            >
              <FormField
                control={form.control}
                name="label"
                render={({ field, fieldState }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="px-1 text-[11px] font-semibold text-foreground">
                      Connection name
                    </FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ''}
                        onChange={(value) =>
                          field.onChange(value, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                        onBlur={() => {
                          field.onBlur();
                          form.trigger('label');
                        }}
                        error={fieldState.error?.message}
                        disabled={busy}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scopes"
                render={({ field }) => (
                  <FormItem className="gap-4">
                    <fieldset className="flex flex-col gap-4">
                      <legend className="flex w-full items-baseline justify-between px-1">
                        <span className="text-[11px] font-semibold text-foreground">
                          Permissions
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted-foreground">
                          {field.value?.length ?? 0} of {options.length}{' '}
                          selected
                        </span>
                      </legend>

                      <div className="flex flex-col gap-1.5">
                        {options.map((scope) => {
                          const selected =
                            field.value?.includes(scope) ?? false;
                          return (
                            <button
                              key={scope}
                              type="button"
                              role="checkbox"
                              aria-checked={selected}
                              disabled={busy}
                              onClick={() =>
                                field.onChange(
                                  selected
                                    ? (field.value ?? []).filter(
                                        (value) => value !== scope,
                                      )
                                    : [...(field.value ?? []), scope],
                                )
                              }
                              className={cn(
                                'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                                selected
                                  ? 'border-ds-brand/40 bg-ds-brand-soft'
                                  : 'border-ds-border bg-ds-surface hover:bg-ds-bg',
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
                                  selected
                                    ? 'border-ds-brand bg-ds-brand text-white'
                                    : 'border-ds-border-strong bg-ds-surface',
                                )}
                              >
                                {selected ? (
                                  <Check className="size-3" strokeWidth={3} />
                                ) : null}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-[13px] font-semibold leading-none text-foreground">
                                  {SCOPE_COPY[scope].label}
                                </span>
                                <span className="text-[11px] leading-[1.5] text-muted-foreground">
                                  {SCOPE_COPY[scope].description}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {deleteOmitted ? (
                        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-[1.5] text-muted-foreground">
                          <ShieldAlert
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                          />
                          Deleting issues requires an Owner or Admin, so it is
                          not offered on your connections.
                        </p>
                      ) : null}
                    </fieldset>

                    <FormMessage className="px-1" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem className="gap-0">
                    <div className="flex w-full items-center gap-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <FormLabel className="text-[13px] font-semibold text-foreground">
                          Expires
                        </FormLabel>
                        <span className="text-xs text-muted-foreground">
                          An expired token stops working on the next request.
                        </span>
                      </div>
                      <FormControl>
                        <Tabs
                          value={field.value}
                          onValueChange={(details) =>
                            field.onChange(details.value as ExpiryChoice)
                          }
                          className="shrink-0"
                        >
                          <TabsList className="h-9.5 gap-1 rounded-lg bg-ds-sidebar p-1">
                            {EXPIRY_OPTIONS.map((option) => (
                              <TabsTrigger
                                key={option.value}
                                value={option.value}
                                className="h-[30px] rounded-md px-3.5"
                              >
                                {option.label}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />

              <Divider />

              <div className="flex w-full items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[11px] leading-[1.5] text-muted-foreground">
                  <Sparkles aria-hidden className="size-3.5 shrink-0" />
                  Shown once, revocable any time.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <DialogPrimitive.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      className="h-9 gap-2 px-4 text-sm font-medium"
                    >
                      Cancel
                    </Button>
                  </DialogPrimitive.Close>
                  <StatefulButton
                    type="submit"
                    size="md"
                    state={buttonState}
                    loadingText="Creating…"
                    successText="Created"
                    errorText="Try again"
                    disabled={!canSubmit || busy}
                    className="h-9 gap-2 bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
                  >
                    Create connection
                  </StatefulButton>
                </div>
              </div>
            </form>
          </Form>
        )}
      </DialogPrimitive.Content>
    </>
  );
}
