'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { usePortal } from '@/components/portal-provider';
import { useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/lib/auth-store';
import { PERMISSIONS, useAuthz } from '@/lib/authz';
import { cn } from '@/lib/cn';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const portal = usePortal();
  const user = useAuthStore((s) => s.user);
  const context = useAuthStore((s) => s.context);
  const logout = useLogout();
  const authz = useAuthz();

  // The storefront (browse + add to cart) is a Restaurant-only experience.
  // Vendors interact with products only through Pricing & Inventory (offers);
  // Admin/Administration manage them through the Catalog.
  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    ...(authz.isRestaurant ? [{ href: '/products', label: 'Products' }] : []),
    ...(authz.can(PERMISSIONS.PRODUCT_CREATE) || authz.can(PERMISSIONS.PRODUCT_REVIEW)
      ? [{ href: '/manage/products', label: 'Catalog' }]
      : []),
    ...(authz.isVendor
      ? [{ href: '/offers', label: 'Pricing & Inventory' }]
      : authz.can(PERMISSIONS.OFFER_REVIEW)
        ? [{ href: '/offers', label: 'Offers' }]
        : []),
    ...(authz.isRestaurant ? [{ href: '/cart', label: 'Cart' }] : []),
    { href: '/orders', label: 'Orders' },
    ...(authz.can(PERMISSIONS.PAYMENT_VERIFY) ? [{ href: '/payments', label: 'Payments' }] : []),
    ...(authz.can(PERMISSIONS.PERFORMANCE_VIEW) ? [{ href: '/vendors', label: 'Vendors' }] : []),
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href={portal.homePath} className="flex items-center gap-2 text-lg font-bold text-brand-700">
            Procure<span className="text-gray-900">Hub</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', portal.badgeClass)}>
              {portal.label}
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={pathname === link.href}
              />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-gray-900">
              {user ? `${user.firstName} ${user.lastName}` : ''}
            </p>
            <p className="text-xs text-gray-500">{context?.roles?.join(', ')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
