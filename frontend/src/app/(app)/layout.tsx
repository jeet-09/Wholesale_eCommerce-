import { AuthGuard } from '@/components/auth-guard';
import { Nav } from '@/components/nav';
import { PortalGuard } from '@/components/portal-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PortalGuard>
        <div className="min-h-screen bg-gray-50">
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
      </PortalGuard>
    </AuthGuard>
  );
}
