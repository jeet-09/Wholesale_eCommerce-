'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/lib/auth-store';
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
  const user = useAuthStore((s) => s.user);
  const context = useAuthStore((s) => s.context);
  const logout = useLogout();

  const isRestaurant = Boolean(context?.restaurantId);

  const links = [
    { href: '/products', label: 'Products' },
    ...(isRestaurant ? [{ href: '/cart', label: 'Cart' }] : []),
    { href: '/orders', label: 'Orders' },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/products" className="text-lg font-bold text-brand-700">
            Procure<span className="text-gray-900">Hub</span>
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
