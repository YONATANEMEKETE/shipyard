import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  Appearance,
  AvatarCard,
  ProfileCard,
  SetAppearanceRequest,
  UpdateProfileRequest,
} from '@shipyard/shared';

import {
  clearAvatar,
  getAppearance,
  getProfile,
  setAppearance,
  SettingsApiError,
  updateProfile,
  uploadAvatar,
} from '@/lib/api/settings';
import { sessionKeys } from '@/hooks/use-session';

// ─────────────────────────────────────────────────────────────────────────────
// Settings query keys + hooks — account-scoped, so no slug appears anywhere.
//
// Mutations are pessimistic by design (api-design §9.3): the account card and
// the theme are authoritative server state, so nothing is applied optimistically
// — the request resolves, then the cache updates from the response.
//
// Profile writes also invalidate the session cache: the sidebar, the user menu
// and every card joined on `user.name` render from it, so a rename that only
// updated the profile query would leave the app showing two different names.
// ─────────────────────────────────────────────────────────────────────────────

export const settingsKeys = {
  all: ['settings'] as const,
  profile: () => [...settingsKeys.all, 'profile'] as const,
  appearance: () => [...settingsKeys.all, 'appearance'] as const,
} as const;

// ── Queries ──

export function useProfile(
  options?: Omit<
    UseQueryOptions<ProfileCard, SettingsApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: getProfile,
    ...options,
  });
}

export function useAppearance(
  options?: Omit<
    UseQueryOptions<Appearance, SettingsApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: settingsKeys.appearance(),
    queryFn: getAppearance,
    ...options,
  });
}

// ── Mutations ──

export function useUpdateProfile(
  options?: UseMutationOptions<
    ProfileCard,
    SettingsApiError,
    UpdateProfileRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: updateProfile,
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(settingsKeys.profile(), data);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUploadAvatar(
  options?: UseMutationOptions<AvatarCard, SettingsApiError, File, unknown>,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: uploadAvatar,
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      // The response carries only `{ image }` — merge it into the cached card
      // so the preview swaps without a refetch.
      queryClient.setQueryData<ProfileCard>(settingsKeys.profile(), (old) =>
        old ? { ...old, image: data.image } : old,
      );
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useClearAvatar(
  options?: UseMutationOptions<ProfileCard, SettingsApiError, void, unknown>,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: clearAvatar,
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(settingsKeys.profile(), data);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useSetAppearance(
  options?: UseMutationOptions<
    Appearance,
    SettingsApiError,
    SetAppearanceRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: setAppearance,
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(settingsKeys.appearance(), data);
      onSuccess?.(data, variables, context, mutation);
    },
  });
}
