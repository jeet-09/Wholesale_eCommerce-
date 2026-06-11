import type { FastifyReply, FastifyRequest } from 'fastify';

import { paginated } from '../../common/responses';
import type { AuditService } from './audit.service';
import type { AuditListQueryInput } from './audit.schemas';

/**
 * Thin controller: parses validated input, calls the service, maps the result
 * to the standard envelope. No business logic, no data access.
 */
export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = async (
    request: FastifyRequest<{ Querystring: AuditListQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };
}
