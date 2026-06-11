import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { UserService } from './user.service';
import type { CreateUserInput, ListUsersQueryInput, UpdateUserInput } from './user.schemas';

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListUsersQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.service.getById(request.params.id);
    await reply.code(200).send(ok(user, request.id));
  };

  create = async (
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.service.create(request.body, getRequestContext(request));
    await reply.code(201).send(ok(user, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateUserInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(user, request.id));
  };

  suspend = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.service.suspend(request.params.id, getRequestContext(request));
    await reply.code(200).send(ok(user, request.id));
  };
}
