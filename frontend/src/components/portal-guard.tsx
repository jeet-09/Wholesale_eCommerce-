'use client';

import { useRouter } from 'next/navigation';

import { usePortal } from '@/components/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { useAuthz } from '@/lib/authz';
import {
  PORTAL_DEFAULT_PORTS,
  accountMatchesPortal,
  portalForAccount,
  portalLabel,
} from '@/lib/portal';

/**
 * Enforces that the signed-in account belongs to the active portal. Because every
 * branded portal runs the same app, this prevents (for example) a Restaurant
 * account from using the Vendor portal — which would otherwise surface the wrong
 * role's UI (e.g. add-to-cart). Renders a clear "wrong portal" screen instead.
 *
 * Must be rendered inside AuthGuard (token present) and PortalProvider.
 */
export function PortalGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const portal = usePortal();
  const authz = useAuthz();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const facts = {
    roles: authz.roles,
    isVendor: authz.isVendor,
    isRestaurant: authz.isRestaurant,
  };

  // Degenerate/empty session (no role info): let page-level guards decide rather
  // than locking the user out of everything.
  const hasRoleInfo = facts.roles.length > 0 || facts.isVendor || facts.isRestaurant;
  if (!hasRoleInfo || accountMatchesPortal(portal.kind, facts)) {
    return <>{children}</>;
  }

  const expected = portalForAccount(facts);
  const expectedLabel = portalLabel(expected);

  let correctPortalUrl: string | null = null;
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      correctPortalUrl = `${protocol}//${hostname}:${PORTAL_DEFAULT_PORTS[expected]}`;
    }
  }

  const onSwitchAccount = () => {
    clear();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardBody className="p-6 text-center">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${portal.badgeClass}`}>
              {portal.label}
            </span>
            <h1 className="mt-4 text-lg font-semibold text-gray-900">Wrong portal for this account</h1>
            <p className="mt-2 text-sm text-gray-500">
              You&apos;re signed in as <span className="font-medium">{user?.email ?? 'your account'}</span>,
              which belongs to the <span className="font-medium">{expectedLabel}</span>. This is the{' '}
              <span className="font-medium">{portal.label}</span>.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {correctPortalUrl && (
                <a
                  href={correctPortalUrl}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  Go to {expectedLabel}
                </a>
              )}
              <Button variant="ghost" className="w-full" onClick={onSwitchAccount}>
                Sign in with a different account
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
