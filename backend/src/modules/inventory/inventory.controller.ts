import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok } from '../../common/responses';
import type { InventoryService } from './inventory.service';
import type { ProductIdParam, UpdateInventoryInput } from './inventory.schemas';

export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  getByProduct = async (
    request: FastifyRequest<{ Params: ProductIdParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const inventory = await this.service.getByProduct(
      request.params.productId,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(inventory, request.id));
  };

  adjust = async (
    request: FastifyRequest<{ Params: ProductIdParam; Body: UpdateInventoryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const inventory = await this.service.adjust(
      request.params.productId,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(inventory, request.id));
  };
}
