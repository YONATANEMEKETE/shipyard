import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import { QueryProvider } from '@/components/providers/query-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeSync } from '@/components/theme-sync';
import {
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_TAGLINE,
  SITE_URL,
  SITE_X_HANDLE,
} from '@/lib/site';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  weight: '700',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * The defaults every route inherits. Per-route metadata (a canonical, an
 * `openGraph` image, a `robots` directive) belongs in that route's own file:
 * anything set here is inherited by `/w/*` and the auth pages too.
 *
 * `metadataBase` is what lets the rest of the app write relative paths —
 * Next resolves them against `SITE_URL` and refuses to guess a domain.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    // `title`/`description` stay unset: with neither present, Next fills
    // `og:title`/`og:description` from each page's own resolved metadata, so
    // every page unfurls with its real title. The image is global — one card
    // for the whole site.
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE_X_HANDLE,
    creator: SITE_X_HANDLE,
    images: [SITE_OG_IMAGE.url],
  },
};

/**
 * `themeColor` is a viewport export, not metadata — it tints the browser
 * chrome around the page. The two hex values mirror `--ds-bg` for each theme
 * in `globals.css`; if that token moves, this moves with it.
 */
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
    { media: '(prefers-color-scheme: dark)', color: '#161512' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {/* Inside the query provider: it reads the stored theme. */}
            <ThemeSync />
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
