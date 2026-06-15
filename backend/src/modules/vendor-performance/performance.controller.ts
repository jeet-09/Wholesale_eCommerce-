import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { PaginationQuery } from '../../common/pagination';
import type { PerformanceService } from './performance.service';
import type { RateVendorInput, VendorIdParam } from './performance.schemas';

export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  list = async (
    request: FastifyRequest<{ Querystring: PaginationQuery }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query, getRequestContext(request));
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getForVendor = async (
    request: FastifyRequest<{ Params: VendorIdParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const dto = await this.service.getForVendor(request.params.vendorId, getRequestContext(request));
    await reply.code(200).send(ok(dto, request.id));
  };

  rate = async (
    request: FastifyRequest<{ Params: VendorIdParam; Body: RateVendorInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const dto = await this.service.rate(
      request.params.vendorId,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(dto, request.id));
  };
}
