/**
 * Account Settings — `/w/[slug]/settings/account`.
 *
 * Heading block per `.pen` `Xwmto` → `Settings Heading Block`: title (28px,
 * weight 650, −0.8 tracking) and subcopy (13px, muted) 8px apart, sitting in
 * a 24px-gapped page column that the cards will stack into.
 *
 * Sections land here next:
 *   - Profile      — avatar preview + actions, display name, read-only email
 *   - Security     — password lives in Auth; this section is a deep link only
 *   - Preferences  — theme (#3/#4) and default issue/project views (F4)
 */
import { ProfileCard } from '@/components/settings/profile-card';

export function AccountSettingsPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold leading-none tracking-[-0.8px] text-foreground">
          Settings
        </h1>
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          Customize your profile, personal information, password, and appearance
          settings.
        </p>
      </div>

      <ProfileCard />
    </div>
  );
}
