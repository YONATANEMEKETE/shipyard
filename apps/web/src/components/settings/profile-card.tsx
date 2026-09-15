'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, Upload, UserRound, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { UpdateProfileRequest } from '@shipyard/shared';
import {
  AVATAR_MAX_BYTES,
  avatarMimeAllowlist,
  updateProfileSchema,
} from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { useToast } from '@/components/providers/toast-provider';
import { EmailChangeRow } from '@/components/settings/email-change-row';
import {
  CONTROL_CLASS,
  FIELD_CLASS_NAMES,
} from '@/components/settings/field-styles';
import { SettingsCard } from '@/components/settings/settings-card';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  useClearAvatar,
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
} from '@/hooks/use-settings';
import { cn } from '@/lib/utils';

/**
 * Profile card.
 *
 * Geometry mirrors `.pen` `Xwmto` → `M7sgdo` (Profile Card): 1128×422 at
 * 1440 wide, so every child sits 18px apart and the card itself is 24px
 * padded. Heights reconcile exactly against the frame:
 *   24 + 14 + 18 + 18 + 18 + 16 + 18 + 72 + 18 + 55 + 18 + 55 + 18 + 36 + 24 = 422
 * (pad, eyebrow, gap, heading, gap, copy, gap, avatar row, gap, name, gap,
 * email row, gap, save row, pad).
 *
 * Card surface follows the frame, not its sibling page: the `.pen` draws
 * every card as fill #FFFFFF + stroke #B9B5AC (`bg-ds-surface` /
 * `border-ds-border-strong`), while `settings-form.tsx` currently ships
 * #F4F3EF + #DEDCD5 (`bg-ds-bg` / `border-ds-border`).
 *
 * Validation is the shared contract (`updateProfileSchema` — trimmed, 1–100,
 * `.strict()`), never a local copy, so the client rejects exactly what the
 * API would.
 *
 * Wiring status: avatar, display name and email. The photo is managed
 * through `useUploadAvatar` / `useClearAvatar`, the name through
 * `useUpdateProfile`, and email through `EmailChangeRow` — which is a
 * confirmation flow (`authClient.changeEmail`), not a save.
 */
const AVATAR_ACCEPT = avatarMimeAllowlist.join(',');
const AVATAR_HINT = 'PNG, JPG, or WebP, up to 2MB.';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * Mirrors the API's avatar gates so a bad pick dies before any bytes move
 * (data-model D3). The server repeats every one of these — this is the cheap
 * copy, never the trusted one: multer still caps the stream at 2MB before
 * buffering, and the controller still sniffs the magic bytes.
 */
function avatarPickProblem(file: File): string | null {
  if (!(avatarMimeAllowlist as readonly string[]).includes(file.type)) {
    return 'Use a JPEG, PNG, or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Keep the photo under 2MB.';
  }
  return null;
}

export function ProfileCard() {
  // ── Profile read — one query seeds every field on the card ──

  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const defaultName = profile?.name ?? '';

  const form = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileSchema),
    // Same seeding contract as `settings-form.tsx`: RHF's `values` prop keeps
    // the field in step with the query, so a late-arriving profile or an
    // account-wide rename elsewhere lands in the input without an effect.
    values: { name: defaultName },
  });

  const watched = useWatch({ control: form.control });
  // The API treats a same-name PATCH as a no-op 200, so the button asks the
  // question the server would otherwise answer with a wasted round trip.
  const hasChanges = watched.name !== defaultName;

  const { showToast } = useToast();

  const updateMutation = useUpdateProfile({
    onSuccess: () => {
      showToast({ status: 'success', title: 'Profile updated' });
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to save your profile',
        description: error.message,
      });
    },
  });

  // ── Avatar ──

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const uploadMutation = useUploadAvatar();
  const clearMutation = useClearAvatar();

  const image = profile?.image ?? null;
  const photoBusy = uploadMutation.isPending || clearMutation.isPending;

  // One line of feedback under the buttons: the picker's own rejection wins,
  // then whatever the API said, then a failed profile read.
  const feedback =
    pickError ??
    uploadMutation.error?.message ??
    clearMutation.error?.message ??
    profileQuery.error?.message ??
    null;

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input first: without this, re-picking the same file after a
    // rejection fires no change event and the picker looks dead.
    event.target.value = '';
    if (!file) return;

    const problem = avatarPickProblem(file);
    if (problem) {
      setPickError(problem);
      return;
    }

    setPickError(null);
    uploadMutation.mutate(file);
  };

  const initialsText = initials(profile?.name ?? '');

  const onSubmit = form.handleSubmit((values) => {
    if (!hasChanges) return;
    updateMutation.mutate(values);
  });

  return (
    <SettingsCard eyebrow="Profile" title="Profile">
      <p className="text-[13px] leading-[1.5] text-muted-foreground">
        Manage how your personal information appears across workspaces — your
        display name, photo, and email.
      </p>

      {/* Avatar row — preview + actions + format hint. Stacks below `sm`:
          a 72px avatar plus two buttons cannot share a phone's width, and
          squeezed buttons are worse than a second line. */}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:gap-[18px]">
        {profileQuery.isPending ? (
          <span
            aria-hidden
            className="size-[72px] shrink-0 animate-pulse rounded-full bg-ds-border/60"
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={profile?.name ?? 'Your profile photo'}
            className={cn(
              'size-[72px] shrink-0 rounded-full object-cover',
              photoBusy && 'opacity-60',
            )}
          />
        ) : (
          // No photo: initials on brand. `UserRound` covers the one case
          // initials cannot — a profile read that failed, so there is no
          // name to take them from.
          <span
            aria-hidden
            className={cn(
              'grid size-[72px] shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-lg font-bold text-white',
              photoBusy && 'opacity-60',
            )}
          >
            {initialsText || <UserRound className="size-7" />}
          </span>
        )}

        <div className="flex min-w-0 flex-col gap-2.5">
          {/* The picker is a real input kept out of the tab order; the button
              is the affordance, so there is never a hidden focus stop. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            tabIndex={-1}
            className="sr-only"
            onChange={handlePick}
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <StatefulButton
              variant="outline"
              disabled={photoBusy}
              state={uploadMutation.isPending ? 'loading' : 'idle'}
              loadingText="Uploading…"
              icon={<Upload className="size-[15px]" />}
              onClick={() => fileInputRef.current?.click()}
              className={`${CONTROL_CLASS} border-ds-border-strong bg-ds-surface text-foreground`}
            >
              Upload photo
            </StatefulButton>
            {/* No confirm step: clearing a photo is reversible by uploading
                another one, and the design frame ships a bare ghost button.
                The API still requires the `confirm: true` literal — the
                client supplies it. */}
            <StatefulButton
              variant="ghost"
              disabled={photoBusy || !image}
              state={clearMutation.isPending ? 'loading' : 'idle'}
              loadingText="Removing…"
              icon={<X className="size-[15px]" />}
              onClick={() => {
                setPickError(null);
                clearMutation.mutate();
              }}
              className={`${CONTROL_CLASS} text-foreground`}
            >
              Remove
            </StatefulButton>
          </div>

          {/* The hint line doubles as the error line — it is already the
              closest text to the buttons, and a toast would cover the very
              preview the user is looking at. */}
          <span
            aria-live="polite"
            className={cn(
              'text-[11px] leading-[1.45]',
              feedback ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {feedback ?? AVATAR_HINT}
          </span>
        </div>
      </div>

      <Form {...form}>
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex w-full flex-col gap-[18px]"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Input
                label="Display name"
                value={field.value}
                onChange={(value) =>
                  field.onChange(value, {
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
                onBlur={() => {
                  field.onBlur();
                  form.trigger('name');
                }}
                error={fieldState.error?.message}
                disabled={profileQuery.isPending}
                className="w-full sm:w-[360px]"
                leftIcon={<Pencil className="size-[15px]" />}
                classNames={FIELD_CLASS_NAMES}
              />
            )}
          />

          {/* Email is Auth-owned: displayed but never written here — the API
              has no email route by design (the profile schema is `.strict()`,
              so an `email` key is a 400). The row owns its own confirmation
              flow. */}
          <EmailChangeRow email={profile?.email ?? ''} />

          <div className="flex w-full items-center gap-3">
            <StatefulButton
              type="submit"
              disabled={
                profileQuery.isPending ||
                !hasChanges ||
                updateMutation.isPending
              }
              state={updateMutation.isPending ? 'loading' : 'idle'}
              loadingText="Saving…"
              icon={<Check className="size-[15px]" />}
              className={`${CONTROL_CLASS} bg-ds-brand text-white hover:bg-ds-brand/90`}
            >
              Save changes
            </StatefulButton>
          </div>
        </form>
      </Form>
    </SettingsCard>
  );
}
