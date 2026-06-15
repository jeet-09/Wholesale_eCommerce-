import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { PaymentService } from './payment.service';
import type {
  ListPaymentsQueryInput,
  OrderIdParam,
  RejectPaymentInput,
  SubmitPaymentInput,
} from './payment.schemas';

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  submit = async (
    request: FastifyRequest<{ Params: OrderIdParam; Body: SubmitPaymentInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const payment = await this.service.submit(
      request.params.orderId,
      request.body,
      getRequestContext(request),
    );
    await reply.code(201).send(ok(payment, request.id));
  };

  listForOrder = async (
    request: FastifyRequest<{ Params: OrderIdParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const payments = await this.service.listForOrder(
      request.params.orderId,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(payments, request.id));
  };

  list = async (
    request: FastifyRequest<{ Querystring: ListPaymentsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(
      request.query,
      getRequestContext(request),
    );
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  verify = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const payment = await this.service.verify(request.params.id, getRequestContext(request));
    await reply.code(200).send(ok(payment, request.id));
  };

  reject = async (
    request: FastifyRequest<{ Params: UuidParam; Body: RejectPaymentInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const payment = await this.service.reject(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(payment, request.id));
  };
}
