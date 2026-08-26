import type { CSSProperties } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Shipyard design tokens · Harbor Amber
// Source: shipyard-design/03-UI/design.md (§3 colors, §4 type, §5 spacing,
// §7 shape). Values map 1:1 to the ds-* tokens in the approved design system.
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  bg: '#F4F3EF', // ds-bg
  surface: '#FFFFFF', // ds-surface
  text: '#171717', // ds-text
  textMuted: '#6C6861', // ds-text-muted
  border: '#DEDCD5', // ds-border
  brand: '#B45309', // ds-brand — primary actions and brand mark
  accent: '#F59E0B', // ds-accent
  brandSoft: '#FFF4DB', // ds-brand-soft
  onBrand: '#FFFFFF', // content on ds-brand
} as const;

export const fontFamily =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// react-email's Font component accepts only known system families here;
// the full UI stack is declared in fontFamily above.
export const fallbackFontFamily = 'Helvetica';

/** Inter variable font (latin subset) — 400–700 live in this single file. */
export const interWebFont = {
  url: 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
  format: 'woff2',
} as const;

// ── Layout (ds-space-8: 32px major sections; ds-radius-lg: 12px cards) ──

export const body: CSSProperties = {
  backgroundColor: colors.bg,
  fontFamily,
  margin: '0 auto',
  padding: '32px 16px',
};

export const container: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`, // ds-border-thin
  borderRadius: '12px', // ds-radius-lg
  margin: '0 auto',
  maxWidth: '520px',
  padding: '32px', // ds-space-8
  width: '100%',
};

export const logo: CSSProperties = {
  display: 'block',
  margin: '0 0 24px', // ds-space-6 below the mark
};

// ── Type (design.md §4: H3 20/600/1.25, body 14/400/1.5, small 12/400/1.5) ──

export const heading: CSSProperties = {
  color: colors.text,
  fontSize: '20px', // Heading 3 — card/panel heading
  fontWeight: 600, // ds 650 renders as semibold in headings
  lineHeight: '1.25',
  margin: '0 0 16px', // ds-space-4
};

export const paragraph: CSSProperties = {
  color: colors.text,
  fontSize: '14px', // Body
  fontWeight: 400,
  lineHeight: '1.5',
  margin: '0 0 16px', // ds-space-4
};

export const button: CSSProperties = {
  backgroundColor: colors.brand,
  borderRadius: '8px', // ds-radius-md
  color: colors.onBrand,
  fontSize: '14px',
  fontWeight: 600,
  padding: '10px 20px',
};

export const fallback: CSSProperties = {
  color: colors.textMuted,
  fontSize: '12px', // Small
  fontWeight: 400,
  lineHeight: '1.5',
  margin: '24px 0 0', // ds-space-6
};

export const link: CSSProperties = {
  color: colors.brand,
  fontWeight: 600,
  textDecoration: 'underline',
};

export const hr: CSSProperties = {
  borderColor: colors.border,
  margin: '28px 0 16px',
};

export const footer: CSSProperties = {
  color: colors.textMuted,
  fontSize: '12px', // Small
  fontWeight: 400,
  lineHeight: '1.5',
  margin: '0',
};
