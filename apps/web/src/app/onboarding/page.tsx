'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Container } from 'lucide-react';

import {
  createWorkspaceSchema,
  type CreateWorkspaceRequest,
} from '@shipyard/shared';

import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  StatefulButton,
  type ButtonState,
} from '@/components/motion/button/stateful';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { IconSelect } from '@/components/workspace/icon-select';

type OnboardingFormValues = CreateWorkspaceRequest;

/** Simulated creation round-trip until the form is wired to the API. */
const SIMULATED_LATENCY_MS = 300;
const SUCCESS_RESET_MS = 1600;

export default function OnboardingPage() {
  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    // Validate on change + blur so field errors appear as the user types.
    mode: 'all',
    defaultValues: {
      name: 'Acme Studio',
      icon: 'boxes',
    },
  });

  // `useWatch` mirrors defaultValues on the server and first client render,
  // so this validity check is hydration-safe (unlike `formState.isValid`,
  // which RHF evaluates differently pre/post hydration).
  const values = useWatch({ control: form.control });
  const canSubmit = createWorkspaceSchema.safeParse(values).success;

  // TODO(workspace): replace with POST /api/v1/workspaces when integrating.
  const createMutation = useMutation({
    mutationFn: async (values: OnboardingFormValues) => {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
      return values;
    },
    onSuccess: () => setButtonState('success'),
    onError: () => setButtonState('error'),
  });

  // Return the button to idle shortly after the simulated success/error so
  // the form stays re-usable while the real API isn't wired up yet.
  useEffect(() => {
    if (buttonState !== 'success' && buttonState !== 'error') return;
    resetTimer.current = setTimeout(
      () => setButtonState('idle'),
      SUCCESS_RESET_MS,
    );
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [buttonState]);

  const onSubmit = form.handleSubmit((values) => {
    setButtonState('loading');
    createMutation.mutate(values);
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <Form {...form}>
        <Stagger className="w-full max-w-[580px] flex flex-col gap-8">
          {/* display:contents keeps Stagger controlling the layout while the
              form still owns submit for all three staggered sections */}
          <form onSubmit={onSubmit} noValidate className="contents">
            {/* Intro Block — matches pen Display Heading + Support Copy */}
            <StaggerItem className="flex flex-col gap-3.5">
              <h1 className="text-[38px] font-bold tracking-[-1.2px] leading-[1.12] text-foreground">
                Set up your team&apos;s home base.
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Every project, issue, and teammate in Shipyard lives inside a
                workspace. Pick a name and an icon — you can change both later.
              </p>
            </StaggerItem>

            {/* Fields Stack — gap 22 in pen → gap-5.5. z-20 lifts the icon select
            panel above the actions section (each stagger item is its own
            stacking context once animated in). */}
            <StaggerItem className="relative z-20 flex flex-col gap-[22px]">
              {/* Name Field Group — validated against shared nameSchema */}
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="text-xs font-semibold text-foreground">
                      Workspace name
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
                          form.trigger('name');
                        }}
                        placeholder="Acme Studio"
                        leftIcon={<Container className="size-4" />}
                        error={fieldState.error?.message}
                        classNames={{
                          field: 'h-11 rounded-md border-border bg-card',
                          input: 'text-sm',
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Icon Field Group — dropdown selector with smooth beui animation */}
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="text-xs font-semibold text-foreground">
                      Icon
                    </FormLabel>
                    <FormControl>
                      <IconSelect
                        value={field.value}
                        onValueChange={(next) =>
                          field.onChange(next, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </StaggerItem>

            {/* Actions Stack — gap 12 */}
            <StaggerItem className="flex flex-col gap-3">
              <StatefulButton
                type="submit"
                size="lg"
                className="h-[46px] w-full rounded-md text-sm font-semibold"
                icon={<ArrowRight className="h-4 w-4" />}
                state={buttonState}
                loadingText="Creating workspace…"
                successText="Workspace created"
                disabled={!canSubmit || createMutation.isPending}
              >
                Create workspace
              </StatefulButton>
              <p className="text-center text-[11px] leading-4 text-muted-foreground">
                You can rename the workspace or change its icon anytime in
                settings.
              </p>
            </StaggerItem>
          </form>
        </Stagger>
      </Form>
    </div>
  );
}
