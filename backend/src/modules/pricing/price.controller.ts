import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { PaginationQuery } from '../../common/pagination';
import type { PricingService } from './price.service';
import type { PriceProductParam, SetPriceInput } from './price.schemas';

export class PricingController {
  constructor(private readonly service: PricingService) {}

  getCurrent = async (
    request: FastifyRequest<{ Params: PriceProductParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const price = await this.service.getCurrent(request.params.productId);
    await reply.code(200).send(ok(price, request.id));
  };

  getSuggestion = async (
    request: FastifyRequest<{ Params: PriceProductParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const suggestion = await this.service.getSuggestion(request.params.productId);
    await reply.code(200).send(ok(suggestion, request.id));
  };

  listHistory = async (
    request: FastifyRequest<{ Params: PriceProductParam; Querystring: PaginationQuery }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.listHistory(
      request.params.productId,
      request.query,
    );
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  setPrice = async (
    request: FastifyRequest<{ Params: PriceProductParam; Body: SetPriceInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const price = await this.service.setPrice(
      request.params.productId,
      request.body,
      getRequestContext(request),
    );
    await reply.code(201).send(ok(price, request.id));
  };
}
