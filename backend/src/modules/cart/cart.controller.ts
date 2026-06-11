import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestContext } from '../../common/http';
import { ok } from '../../common/responses';
import type { CartService } from './cart.service';
import type { AddCartItemInput, CartItemParam, UpdateCartItemInput } from './cart.schemas';

export class CartController {
  constructor(private readonly service: CartService) {}

  getCart = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const cart = await this.service.getCart(getRequestContext(request));
    await reply.code(200).send(ok(cart, request.id));
  };

  addItem = async (
    request: FastifyRequest<{ Body: AddCartItemInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const cart = await this.service.addItem(getRequestContext(request), request.body);
    await reply.code(200).send(ok(cart, request.id));
  };

  updateItem = async (
    request: FastifyRequest<{ Params: CartItemParam; Body: UpdateCartItemInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const cart = await this.service.updateItem(
      getRequestContext(request),
      request.params.itemId,
      request.body,
    );
    await reply.code(200).send(ok(cart, request.id));
  };

  removeItem = async (
    request: FastifyRequest<{ Params: CartItemParam }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const cart = await this.service.removeItem(getRequestContext(request), request.params.itemId);
    await reply.code(200).send(ok(cart, request.id));
  };
}
