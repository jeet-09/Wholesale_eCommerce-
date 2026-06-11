import type { Metadata } from 'next';

import { resolvePortal } from '@/lib/portal';
import './globals.css';
import { Providers } from './providers';

// Read the runtime PORTAL env on every request (one image, many role portals).
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const portal = resolvePortal(process.env.PORTAL);
  return {
    title: `${portal.label} · ProcureHub`,
    description: 'Wholesale procurement marketplace for restaurants and vendors',
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const portal = resolvePortal(process.env.PORTAL);
  return (
    <html lang="en">
      <body>
        <Providers portal={portal}>{children}</Providers>
      </body>
    </html>
  );
}
