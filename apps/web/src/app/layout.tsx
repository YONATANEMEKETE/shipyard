import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shipyard',
  description: 'Plan. Build. Ship.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
