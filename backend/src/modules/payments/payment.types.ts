import type { Prisma } from '@prisma/client';

export const paymentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      restaurantId: true,
      assignedVendorId: true,
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithOrder = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface PaymentDto {
  id: string;
  orderId: string;
  orderNumber: string | null;
  paymentType: string;
  amount: string;
  currency: string;
  status: string;
  proofUrl: string | null;
  transactionReference: string | null;
  remarks: string | null;
  submittedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}
