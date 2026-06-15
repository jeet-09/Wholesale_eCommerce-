import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { OrderService } from './order.service';
import type {
  AssignVendorInput,
  CancelOrderInput,
  CompleteOrderInput,
  ListOrdersQueryInput,
  PlaceOrderInput,
  RejectOrderInput,
  UpdateFulfilmentInput,
  VendorRespondInput,
} from './order.schemas';

export class OrderController {
  constructor(private readonly service: OrderService) {}

  place = async (
    request: FastifyRequest<{ Body: PlaceOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.placeOrder(getRequestContext(request), request.body);
    await reply.code(201).send(ok(order, request.id));
  };

  list = async (
    request: FastifyRequest<{ Querystring: ListOrdersQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query, getRequestContext(request));
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.getById(request.params.id, getRequestContext(request));
    await reply.code(200).send(ok(order, request.id));
  };

  assignVendor = async (
    request: FastifyRequest<{ Params: UuidParam; Body: AssignVendorInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.assignVendor(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };

  respond = async (
    request: FastifyRequest<{ Params: UuidParam; Body: VendorRespondInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.vendorRespond(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };

  updateFulfilment = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateFulfilmentInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.updateFulfilment(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };

  complete = async (
    request: FastifyRequest<{ Params: UuidParam; Body: CompleteOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.complete(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };

  reject = async (
    request: FastifyRequest<{ Params: UuidParam; Body: RejectOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.reject(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };

  cancel = async (
    request: FastifyRequest<{ Params: UuidParam; Body: CancelOrderInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const order = await this.service.cancel(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(order, request.id));
  };
}
