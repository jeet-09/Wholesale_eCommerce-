import type { Prisma } from '@prisma/client';

export const callInclude = {
  vendor: { select: { id: true, vendorName: true } },
  order: { select: { id: true, orderNumber: true } },
} satisfies Prisma.VendorCallLogInclude;

export type CallWithRelations = Prisma.VendorCallLogGetPayload<{ include: typeof callInclude }>;

export interface CallDto {
  id: string;
  orderId: string;
  orderNumber: string | null;
  vendorId: string;
  vendorName: string | null;
  calledBy: string | null;
  outcome: string;
  remarks: string | null;
  createdAt: string;
}
