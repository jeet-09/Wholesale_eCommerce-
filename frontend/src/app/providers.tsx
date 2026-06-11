'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { PortalProvider } from '@/components/portal-provider';
import type { PortalConfig } from '@/lib/portal';

export function Providers({
  portal,
  children,
}: {
  portal: PortalConfig;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PortalProvider portal={portal}>{children}</PortalProvider>
    </QueryClientProvider>
  );
}
