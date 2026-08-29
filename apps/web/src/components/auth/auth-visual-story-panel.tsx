import Image from 'next/image';

interface AuthVisualStoryPanelProps {
  /**
   * Override the headline. Defaults match the brand voice in the
   * `Auth Shell / Default` frame in `shipyard-design/03-UI/shipyard.pen`.
   */
  headline?: string;
  description?: string;
}

/**
 * The branded left-hand panel of every auth screen.
 *
 * Full-bleed left-hand panel of every auth screen, sized as a percentage of
 * the viewport so it scales with the form column on the right. Rounded and
 * shadowed so it reads as a card sitting on the ds-bg surface. Hidden
 * below the `md` breakpoint — the auth layout lets the form own the
 * full viewport on mobile.
 */
export function AuthVisualStoryPanel({
  headline = 'Plan. Build. Ship.',
  description = 'The easiest way for small software teams to manage work and ship software.',
}: AuthVisualStoryPanelProps) {
  return (
    <aside
      aria-label="Shipyard"
      className="relative hidden h-full w-[40%] max-w-[720px] overflow-hidden rounded-xl bg-ds-sidebar-dark shadow-lg md:block"
    >
      {/* Background photograph */}
      <Image
        src="/auth/visual-story.avif"
        alt=""
        fill
        priority
        sizes="(min-width: 768px) 40vw, 0px"
        className="object-cover"
      />

      {/* Legibility overlay — top translucent → bottom opaque warm-brown */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/25 to-black/85"
      />

      {/* Content layer */}
      <div className="relative flex h-full flex-col p-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/app-icon.png"
            alt=""
            width={34}
            height={34}
            priority
            className="h-[34px] w-[34px]"
          />
          <span
            className="text-lg font-extrabold tracking-[-0.0125em] text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Shipyard
          </span>
        </div>

        <div className="mt-auto flex max-w-[400px] flex-col gap-3">
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            {headline}
          </h2>
          <p className="text-sm leading-[1.5] text-white/80">{description}</p>
        </div>
      </div>
    </aside>
  );
}
