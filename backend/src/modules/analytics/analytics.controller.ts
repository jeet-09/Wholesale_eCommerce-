import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok } from '../../common/responses';
import type { AnalyticsService } from './analytics.service';

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  dashboard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const data = await this.service.getDashboard(getRequestContext(request));
    await reply.code(200).send(ok(data, request.id));
  };
}
