'use client';

import { createContext, useContext } from 'react';

import type { PortalConfig } from '@/lib/portal';

const PortalContext = createContext<PortalConfig | null>(null);

export function PortalProvider({
  portal,
  children,
}: {
  portal: PortalConfig;
  children: React.ReactNode;
}) {
  return <PortalContext.Provider value={portal}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalConfig {
  const ctx = useContext(PortalContext);
  if (!ctx) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return ctx;
}
