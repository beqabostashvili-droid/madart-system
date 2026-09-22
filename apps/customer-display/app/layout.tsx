import '@madart/ui/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'MADART – შეკვეთები', description: 'Customer order display' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ka">
      <body className="touch-app overflow-hidden bg-ink">{children}</body>
    </html>
  );
}
