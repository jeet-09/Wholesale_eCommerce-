import { toMoneyString } from '../../utils/decimal';
import type { PaymentDto, PaymentWithOrder } from './payment.types';

export function toPaymentDto(payment: PaymentWithOrder): PaymentDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.order?.orderNumber ?? null,
    paymentType: payment.paymentType,
    amount: toMoneyString(payment.amount),
    currency: payment.currency,
    status: payment.status,
    proofUrl: payment.proofUrl,
    transactionReference: payment.transactionReference,
    remarks: payment.remarks,
    submittedBy: payment.submittedBy,
    verifiedBy: payment.verifiedBy,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}
