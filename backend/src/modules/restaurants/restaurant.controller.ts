import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { RestaurantService } from './restaurant.service';
import type { ListRestaurantsQueryInput, UpdateRestaurantInput } from './restaurant.schemas';

export class RestaurantController {
  constructor(private readonly service: RestaurantService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListRestaurantsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const restaurant = await this.service.getById(request.params.id);
    await reply.code(200).send(ok(restaurant, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateRestaurantInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const restaurant = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(restaurant, request.id));
  };
}
