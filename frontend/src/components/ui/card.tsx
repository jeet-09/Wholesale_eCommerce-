import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-gray-200 bg-white shadow-sm', className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  // Order lifecycle
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800',
  PAYMENT_RECEIVED: 'bg-teal-100 text-teal-800',
  PENDING_ADMIN_REVIEW: 'bg-amber-100 text-amber-800',
  VENDOR_ASSIGNED: 'bg-blue-100 text-blue-800',
  VENDOR_ACCEPTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  READY_FOR_DELIVERY: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-200 text-gray-700',
  REJECTED: 'bg-red-100 text-red-800',
  // Legacy order statuses (kept for safety)
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  // Product / offer states
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-200 text-gray-700',
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  // Payment states
  SUBMITTED: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-green-100 text-green-800',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
