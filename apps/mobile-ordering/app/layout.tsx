import '@madart/ui/styles.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'MADART – წინასწარი შეკვეთა',
  description: 'შეუკვეთეთ წინასწარ და აიღეთ ფილიალში',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MADART', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#ffbb00', width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
