import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { CallService } from './call.service';
import type { CallOrderIdParam, ListCallsQueryInput, LogCallInput } from './call.schemas';

export class CallController {
  constructor(private readonly service: CallService) {}

  log = async (
    request: FastifyRequest<{ Params: CallOrderIdParam; Body: LogCallInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const call = await this.service.log(
      request.params.orderId,
      request.body,
      getRequestContext(request),
    );
    await reply.code(201).send(ok(call, request.id));
  };

  listForOrder = async (
    request: FastifyRequest<{ Params: CallOrderIdParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const calls = await this.service.listForOrder(request.params.orderId);
    await reply.code(200).send(ok(calls, request.id));
  };

  list = async (
    request: FastifyRequest<{ Querystring: ListCallsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };
}
