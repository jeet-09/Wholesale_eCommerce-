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
    homePath: '/dashboard',
    badgeClass: 'bg-brand-100 text-brand-700',
  },
  vendor: {
    label: 'Vendor Portal',
    demoEmail: 'vendor@demo.local',
    homePath: '/dashboard',
    badgeClass: 'bg-blue-100 text-blue-700',
  },
  admin: {
    label: 'Admin Portal',
    demoEmail: 'admin@procurement.local',
    homePath: '/dashboard',
    badgeClass: 'bg-purple-100 text-purple-700',
  },
  ops: {
    label: 'Operations Portal',
    demoEmail: 'ops@procurement.local',
    homePath: '/dashboard',
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

/** Default localhost ports for each portal in the bundled docker-compose setup. */
export const PORTAL_DEFAULT_PORTS: Record<PortalKind, number> = {
  restaurant: 3000,
  admin: 3001,
  vendor: 3002,
  ops: 3003,
};

/** Minimal role facts needed to decide which portal an account belongs to. */
export interface PortalAccountFacts {
  roles: string[];
  isVendor: boolean;
  isRestaurant: boolean;
}

/**
 * Whether the signed-in account is allowed to use a given portal. Each branded
 * portal is role-scoped (project-working.md role hierarchy): a Restaurant account
 * cannot use the Vendor portal and vice versa. Admin (super-user) may also use the
 * Operations portal.
 */
export function accountMatchesPortal(kind: PortalKind, facts: PortalAccountFacts): boolean {
  switch (kind) {
    case 'restaurant':
      return facts.isRestaurant;
    case 'vendor':
      return facts.isVendor;
    case 'admin':
      return facts.roles.includes('ADMIN');
    case 'ops':
      return facts.roles.includes('OPERATIONS') || facts.roles.includes('ADMIN');
    default:
      return false;
  }
}

/** The portal an account should be using, for redirect/help hints. */
export function portalForAccount(facts: PortalAccountFacts): PortalKind {
  if (facts.roles.includes('ADMIN')) return 'admin';
  if (facts.roles.includes('OPERATIONS')) return 'ops';
  if (facts.isVendor) return 'vendor';
  if (facts.isRestaurant) return 'restaurant';
  return 'restaurant';
}

/** Human label for a portal kind (e.g. for "use the Vendor Portal" hints). */
export function portalLabel(kind: PortalKind): string {
  return PORTALS[kind].label;
}
