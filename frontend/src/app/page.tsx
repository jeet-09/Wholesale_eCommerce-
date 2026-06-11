'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { usePortal } from '@/components/portal-provider';
import { useAuthStore } from '@/lib/auth-store';

export default function HomePage() {
  const router = useRouter();
  const portal = usePortal();
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    router.replace(token ? portal.homePath : '/login');
  }, [token, router, portal.homePath]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
      Loading…
    </div>
  );
}
