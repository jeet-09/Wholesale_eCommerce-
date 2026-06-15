import type { CallDto, CallWithRelations } from './call.types';

export function toCallDto(call: CallWithRelations): CallDto {
  return {
    id: call.id,
    orderId: call.orderId,
    orderNumber: call.order?.orderNumber ?? null,
    vendorId: call.vendorId,
    vendorName: call.vendor?.vendorName ?? null,
    calledBy: call.calledBy,
    outcome: call.outcome,
    remarks: call.remarks,
    createdAt: call.createdAt.toISOString(),
  };
}
