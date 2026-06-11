import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, successEnvelope } from '../../common/schemas';
import type { CartController } from './cart.controller';
import {
  addCartItemSchema,
  cartItemParamSchema,
  cartResponseSchema,
  updateCartItemSchema,
} from './cart.schemas';
import type { AddCartItemInput, CartItemParam, UpdateCartItemInput } from './cart.schemas';

export function registerCartRoutes(app: FastifyInstance, controller: CartController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get(
    '/cart',
    {
      schema: {
        tags: ['cart'],
        summary: "Get the restaurant's active cart",
        security: [{ bearerAuth: [] }],
        response: { 200: successEnvelope(cartResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CART_MANAGE)],
    },
    controller.getCart,
  );

  router.post<{ Body: AddCartItemInput }>(
    '/cart/items',
    {
      schema: {
        tags: ['cart'],
        summary: 'Add an item to the cart',
        security: [{ bearerAuth: [] }],
        body: addCartItemSchema,
        response: { 200: successEnvelope(cartResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CART_MANAGE)],
    },
    controller.addItem,
  );

  router.patch<{ Params: CartItemParam; Body: UpdateCartItemInput }>(
    '/cart/items/:itemId',
    {
      schema: {
        tags: ['cart'],
        summary: 'Update the quantity of a cart item',
        security: [{ bearerAuth: [] }],
        params: cartItemParamSchema,
        body: updateCartItemSchema,
        response: { 200: successEnvelope(cartResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CART_MANAGE)],
    },
    controller.updateItem,
  );

  router.delete<{ Params: CartItemParam }>(
    '/cart/items/:itemId',
    {
      schema: {
        tags: ['cart'],
        summary: 'Remove an item from the cart',
        security: [{ bearerAuth: [] }],
        params: cartItemParamSchema,
        response: { 200: successEnvelope(cartResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CART_MANAGE)],
    },
    controller.removeItem,
  );
}
