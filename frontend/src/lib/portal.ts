// Portal identity. Each deployment/instance is branded for one role via the
// runtime `PORTAL` env var (read server-side in the root layout). This lets us
// run the SAME image on different ports as different role portals.

export type PortalKind = 'restaurant' | 'vendor' | 'admin' | 'ops';

export interface PortalConfig {
  kind: PortalKind;
  /** Human label shown in the UI, e.g. "Vendor Portal". */
  label: string;
  /** Demo account pre-filled on the login screen for this portal. */
  demoEmail: string;
  /** Where to land after login. */
  homePath: string;
  /** Tailwind accent classes for the portal badge. */
  badgeClass: string;
}

const PORTALS: Record<PortalKind, Omit<PortalConfig, 'kind'>> = {
  restaurant: {
    label: 'Restaurant Portal',
    demoEmail: 'restaurant@demo.local',
    homePath: '/products',
    badgeClass: 'bg-brand-100 text-brand-700',
  },
  vendor: {
    label: 'Vendor Portal',
    demoEmail: 'vendor@demo.local',
    homePath: '/orders',
    badgeClass: 'bg-blue-100 text-blue-700',
  },
  admin: {
    label: 'Admin Portal',
    demoEmail: 'admin@procurement.local',
    homePath: '/orders',
    badgeClass: 'bg-purple-100 text-purple-700',
  },
  ops: {
    label: 'Operations Portal',
    demoEmail: 'ops@procurement.local',
    homePath: '/orders',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
};

const KINDS = Object.keys(PORTALS) as PortalKind[];

function isPortalKind(value: string): value is PortalKind {
  return (KINDS as string[]).includes(value);
}

/** Resolve the active portal from an env value, defaulting to restaurant. */
export function resolvePortal(value: string | undefined | null): PortalConfig {
  const kind: PortalKind = value && isPortalKind(value) ? value : 'restaurant';
  return { kind, ...PORTALS[kind] };
}
