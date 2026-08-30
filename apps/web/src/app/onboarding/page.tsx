'use client';

import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { StatefulButton } from '@/components/motion/button/stateful';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { IconSelect } from '@/components/workspace/icon-select';
import { useCreateWorkspace } from '@/hooks/use-workspaces';
import { setSelectedWorkspace } from '@/lib/workspace/selected-workspace';
import { useToast } from '@/components/providers/toast-provider';

type OnboardingFormValues = CreateWorkspaceRequest;

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    mode: 'all',
    defaultValues: {
      name: 'Acme Studio',
      icon: 'boxes',
    },
  });

  const values = useWatch({ control: form.control });
  const canSubmit = createWorkspaceSchema.safeParse(values).success;

  const createMutation = useCreateWorkspace({
    onSuccess: (workspace) => {
      showToast({
        status: 'success',
        title: 'Workspace created',
        description: `${workspace.name} is ready.`,
      });
      setSelectedWorkspace(workspace.slug);
      router.replace(`/w/${workspace.slug}`);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create workspace',
        description: error.message || 'Please try again.',
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12 md:py-16">
      <Form {...form}>
        <Stagger className="flex w-full max-w-[580px] flex-col gap-6 sm:gap-8">
          {/* display:contents keeps Stagger controlling the layout while the
              form still owns submit for all three staggered sections */}
          <form onSubmit={onSubmit} noValidate className="contents">
            {/* Intro Block — matches pen Display Heading + Support Copy */}
            <StaggerItem className="flex flex-col gap-2.5 sm:gap-3.5">
              <h1 className="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.9px] text-foreground sm:text-[34px] sm:leading-[1.12] sm:tracking-[-1.1px] md:text-[38px] md:tracking-[-1.2px]">
                Set up your team&apos;s home base.
              </h1>
              <p className="text-[13px] leading-6 text-muted-foreground sm:text-sm">
                Every project, issue, and teammate in Shipyard lives inside a
                workspace. Pick a name and an icon — you can change both later.
              </p>
            </StaggerItem>

            {/* Fields Stack — gap 22 in pen → gap-5.5. z-20 lifts the icon select
            panel above the actions section (each stagger item is its own
            stacking context once animated in). */}
            <StaggerItem className="relative z-20 flex flex-col gap-4 sm:gap-[22px]">
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
            <StaggerItem className="flex flex-col gap-2.5 sm:gap-3">
              <StatefulButton
                type="submit"
                size="lg"
                className="h-11 w-full rounded-md bg-ds-brand text-[13px] font-semibold text-white hover:bg-ds-brand/90 sm:h-[46px] sm:text-sm"
                icon={<ArrowRight className="h-4 w-4" />}
                state={createMutation.isPending ? 'loading' : 'idle'}
                loadingText="Creating workspace…"
                successText="Workspace created"
                disabled={!canSubmit || createMutation.isPending}
              >
                Create workspace
              </StatefulButton>
              <p className="text-balance px-2 text-center text-[11px] leading-4 text-muted-foreground sm:px-0">
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
