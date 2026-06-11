import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { ProductService } from './product.service';
import type {
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from './product.schemas';

export class ProductController {
  constructor(private readonly service: ProductService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListProductsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query, getRequestContext(request));
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const product = await this.service.getById(request.params.id, getRequestContext(request));
    await reply.code(200).send(ok(product, request.id));
  };

  create = async (
    request: FastifyRequest<{ Body: CreateProductInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const product = await this.service.create(request.body, getRequestContext(request));
    await reply.code(201).send(ok(product, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateProductInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const product = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(product, request.id));
  };

  remove = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.service.delete(request.params.id, getRequestContext(request));
    await reply.code(204).send();
  };
}
