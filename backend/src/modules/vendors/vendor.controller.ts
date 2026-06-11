import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { VendorService } from './vendor.service';
import type { ListVendorsQueryInput, UpdateVendorInput } from './vendor.schemas';

export class VendorController {
  constructor(private readonly service: VendorService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListVendorsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const vendor = await this.service.getById(request.params.id);
    await reply.code(200).send(ok(vendor, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateVendorInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const vendor = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(vendor, request.id));
  };
}
