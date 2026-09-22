import '@madart/ui/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'MADART Admin', description: 'Backoffice' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
