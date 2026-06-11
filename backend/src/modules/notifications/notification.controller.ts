import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { NotificationService } from './notification.service';
import type { ListNotificationsQueryInput } from './notification.schemas';

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListNotificationsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(
      getRequestContext(request),
      request.query,
    );
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  markRead = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const notification = await this.service.markRead(
      getRequestContext(request),
      request.params.id,
    );
    await reply.code(200).send(ok(notification, request.id));
  };

  markAllRead = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await this.service.markAllRead(getRequestContext(request));
    await reply.code(200).send(ok(result, request.id));
  };
}
