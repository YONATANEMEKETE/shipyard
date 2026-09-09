'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus, Tag, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useForm, useWatch } from 'react-hook-form';

import {
  createLabelSchema,
  type CreateLabelRequest,
  type LabelCard,
  updateLabelSchema,
} from '@shipyard/shared';
import { Input } from '@/components/ui/input';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/motion/button/base';
import { useCreateLabel, useUpdateLabel } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

const SWATCHES = [
  { color: '#B45309', bg: 'bg-ds-brand' },
  { color: '#B42318', bg: 'bg-ds-danger' },
  { color: '#A65F00', bg: 'bg-ds-warning' },
  { color: '#2E7D5B', bg: 'bg-ds-success' },
  { color: '#2563EB', bg: 'bg-ds-info' },
  { color: '#F59E0B', bg: 'bg-ds-accent' },
] as const;

export function CreateLabelDialog({
  open,
  onOpenChange,
  slug,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  label?: LabelCard | null;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <CreateLabelDialogContent
          slug={slug}
          label={label ?? null}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CreateLabelDialogContent({
  slug,
  label,
  onOpenChange,
}: {
  slug: string;
  label: LabelCard | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();

  const isEdit = Boolean(label);
  const form = useForm<CreateLabelRequest>({
    resolver: zodResolver(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (isEdit ? updateLabelSchema : createLabelSchema) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any,
    mode: 'all',
    defaultValues: label
      ? { name: label.name, color: label.color }
      : { name: '', color: '#B45309' },
  });

  useEffect(() => {
    if (label) form.reset({ name: label.name, color: label.color } as never);
    else form.reset({ name: '', color: '#B45309' } as never);
  }, [label, form]);

  const values = useWatch({ control: form.control }) as CreateLabelRequest;
  const canSubmit = (
    (isEdit ? updateLabelSchema : createLabelSchema) as unknown as {
      safeParse: (v: unknown) => { success: boolean };
    }
  ).safeParse(values).success;
  const showErrors = form.formState.isSubmitted;

  const createMutation = useCreateLabel(slug, {
    onSuccess: (created) => {
      showToast({
        status: 'success',
        title: 'Label created',
        description: created.name,
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) =>
      showToast({
        status: 'error',
        title: 'Failed to create label',
        description: (e as Error).message,
      }),
  });
  const updateMutation = useUpdateLabel(slug, {
    onSuccess: (updated) => {
      showToast({
        status: 'success',
        title: 'Label updated',
        description: updated.name,
      });
      onOpenChange(false);
    },
    onError: (e) =>
      showToast({
        status: 'error',
        title: 'Failed to update label',
        description: (e as Error).message,
      }),
  });

  const busy = createMutation.isPending || updateMutation.isPending;

  const onSubmit = form.handleSubmit((vals) => {
    if (isEdit && label)
      updateMutation.mutate({ labelId: label.id, body: vals });
    else createMutation.mutate(vals as CreateLabelRequest);
  });

  const previewName = values.name?.trim() || 'label';
  const previewColor = values.color ?? '#B45309';

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 rounded-2xl border border-ds-border bg-ds-surface p-6 shadow-[0_16px_40px_#17171720]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        <div className="flex w-full items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              {isEdit ? 'Edit label' : 'New label'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-[13px] leading-[1.5] text-muted-foreground">
              {isEdit
                ? 'Update the label name or color. Changes apply everywhere instantly.'
                : 'Create a label to organize issues. Choose a short name and a color — it applies instantly.'}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:bg-ds-surface hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </DialogPrimitive.Close>
        </div>

        <div className="flex w-full justify-start">
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-3 text-xs font-medium"
            style={{
              backgroundColor: `${previewColor}18`,
              color: previewColor,
            }}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: previewColor }}
              aria-hidden
            />
            {previewName}
          </span>
        </div>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="create-label-name"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Name
            </label>
            <Input
              value={values.name ?? ''}
              onChange={(v) =>
                form.setValue('name', v, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onBlur={() => form.trigger('name')}
              placeholder="e.g. bug, frontend, design"
              leftIcon={<Tag className="size-3.5" />}
              error={
                showErrors ? form.formState.errors.name?.message : undefined
              }
              classNames={{
                field:
                  'h-11 rounded-xl border-ds-border bg-ds-surface-subtle focus-within:border-ds-border-strong focus-within:bg-ds-surface',
                input: 'text-sm',
              }}
              disabled={busy}
            />
            <span className="px-1 text-[11px] leading-none text-muted-foreground">
              Lowercase, single word works best.
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Color
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {SWATCHES.map((s) => {
                const selected = values.color === s.color;
                return (
                  <button
                    key={s.color}
                    type="button"
                    aria-label={`Select ${s.color}`}
                    aria-pressed={selected}
                    onClick={() =>
                      form.setValue('color', s.color, {
                        shouldValidate: form.formState.isSubmitted,
                      })
                    }
                    className={cn(
                      'group relative grid size-8 shrink-0 place-items-center rounded-full transition-all duration-200 hover:scale-105',
                      selected
                        ? 'scale-110 shadow-[0_2px_8px_#00000018]'
                        : 'hover:shadow-sm',
                    )}
                    style={{ backgroundColor: s.color }}
                  >
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full ring-2 ring-white/90 transition-opacity',
                        selected ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    {selected ? (
                      <Check className="relative size-4 text-white drop-shadow-sm" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex w-full items-center justify-end gap-2.5 pt-2">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 gap-2 rounded-md px-3 text-xs font-semibold"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <StatefulButton
              type="submit"
              state={busy ? 'loading' : 'idle'}
              loadingText={isEdit ? 'Saving…' : 'Creating…'}
              icon={isEdit ? undefined : <Plus className="size-4" />}
              disabled={!canSubmit || busy}
              className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
            >
              {isEdit ? 'Save changes' : 'Create label'}
            </StatefulButton>
          </div>
        </form>
      </DialogPrimitive.Content>
    </>
  );
}
