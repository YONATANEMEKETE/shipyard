interface PrecisionLoopMarkProps {
  /**
   * Color of the mark. Defaults to `currentColor` so it inherits from the
   * surrounding text/icon color (white in the auth shell logo).
   */
  className?: string;
}

/**
 * The Shipyard "Precision Loop" mark.
 *
 * PLACEHOLDER GEOMETRY — the real path lives in
 * `shipyard-design/03-UI/shipyard-logo-system.pen` and should be pasted here
 * once available. The viewBox and stroke conventions below match the canvas
 * (viewBox 0 0 100 108, stroke 8, bevel joins, square caps) so swapping is a
 * drop-in replacement.
 */
export function PrecisionLoopMark({ className }: PrecisionLoopMarkProps) {
  return (
    <svg
      viewBox="0 0 100 108"
      fill="none"
      stroke="currentColor"
      strokeWidth={8}
      strokeLinejoin="bevel"
      strokeLinecap="square"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Rounded loop */}
      <path d="M 20 4 L 80 4 Q 96 4 96 20 L 96 88 Q 96 104 80 104 L 20 104 Q 4 104 4 88 L 4 20 Q 4 4 20 4 Z" />
      {/* Precision crosshair */}
      <path d="M 50 34 L 50 74 M 30 54 L 70 54" />
    </svg>
  );
}
