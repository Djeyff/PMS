import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'PMS Web', description: 'PMS web app' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
