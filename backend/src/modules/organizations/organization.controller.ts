import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok, paginated } from '../../common/responses';
import type { UuidParam } from '../../common/schemas';
import type { OrganizationService } from './organization.service';
import type {
  AddAddressInput,
  AddMemberInput,
  ListOrganizationsQueryInput,
  UpdateOrganizationInput,
} from './organization.schemas';

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  list = async (
    request: FastifyRequest<{ Querystring: ListOrganizationsQueryInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const { items, pagination } = await this.service.list(request.query);
    await reply.code(200).send(paginated(items, pagination, request.id));
  };

  getById = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const org = await this.service.getById(request.params.id);
    await reply.code(200).send(ok(org, request.id));
  };

  update = async (
    request: FastifyRequest<{ Params: UuidParam; Body: UpdateOrganizationInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const org = await this.service.update(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(200).send(ok(org, request.id));
  };

  listMembers = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const members = await this.service.listMembers(request.params.id);
    await reply.code(200).send(ok(members, request.id));
  };

  addMember = async (
    request: FastifyRequest<{ Params: UuidParam; Body: AddMemberInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const member = await this.service.addMember(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(201).send(ok(member, request.id));
  };

  listAddresses = async (
    request: FastifyRequest<{ Params: UuidParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const addresses = await this.service.listAddresses(request.params.id);
    await reply.code(200).send(ok(addresses, request.id));
  };

  addAddress = async (
    request: FastifyRequest<{ Params: UuidParam; Body: AddAddressInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const address = await this.service.addAddress(
      request.params.id,
      request.body,
      getRequestContext(request),
    );
    await reply.code(201).send(ok(address, request.id));
  };
}
