import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { OfferService } from './offer.service';
import type {
  ListOffersQueryInput,
  ReviewOfferInput,
  SubmitOfferInput,
  UpdateOfferInput,
} from './offer.schemas';

export class OfferController {
  constructor(private readonly service: OfferService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListOffersQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query, getRequestContext(request));
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const offer = await this.service.getById(request.params.id, getRequestContext(request));
    await reply.code(200).send(ok(offer, request.id));
  };

  submit = async (
    request: FastifyRequest<{ Body: SubmitOfferInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const offer = await this.service.submit(request.body, getRequestContext(request));
    await reply.code(201).send(ok(offer, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateOfferInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const offer = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(offer, request.id));
  };

  review = async (
    request: FastifyRequest<{ Params: UuidParam; Body: ReviewOfferInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const offer = await this.service.review(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(offer, request.id));
  };
}
