import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { CategoryService } from './category.service';
import type {
  CreateCategoryInput,
  ListCategoriesQueryInput,
  UpdateCategoryInput,
} from './category.schemas';

export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListCategoriesQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const category = await this.service.getById(request.params.id);
    await reply.code(200).send(ok(category, request.id));
  };

  create = async (
    request: FastifyRequest<{ Body: CreateCategoryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const category = await this.service.create(request.body, getRequestContext(request));
    await reply.code(201).send(ok(category, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateCategoryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const category = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(category, request.id));
  };

  remove = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.service.delete(request.params.id, getRequestContext(request));
    await reply.code(204).send();
  };
}
