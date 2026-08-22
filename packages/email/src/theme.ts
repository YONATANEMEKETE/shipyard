/**
 * Harbor Amber design tokens (03-UI/exports/globals.css — light mode).
 * Single source of hex values for every email template.
 */
export const colors = {
  /** App background (ds-bg) */
  background: '#f4f3ef',
  /** Card / surface (ds-surface) */
  card: '#ffffff',
  /** Primary text (ds-text) */
  ink: '#171717',
  /** Muted text (ds-text-muted) */
  inkMuted: '#6c6861',
  /** Brand / primary CTA (ds-brand) */
  brand: '#b45309',
  /** Brand tint — emphasis / soft fills (ds-brand-soft) */
  brandSoft: '#fff4db',
  /** Bold brand accent (ds-focus amber) */
  amber: '#f59e0b',
  /** Borders (ds-border) */
  border: '#dedcd5',
} as const;

/**
 * Base URL for email static assets (logo etc.).
 * - Dev preview: empty → relative /static/logo.png (served by the react-email
 *   dev server).
 * - Production: must be an absolute, publicly reachable URL — set
 *   EMAIL_ASSET_URL in the API/deploy env when emails start sending for real.
 */
export const assetBaseURL: string = process.env.EMAIL_ASSET_URL ?? '';
