import { Prisma } from '@prisma/client';

import { NotFoundError, ValidationError } from '../../common/errors';
import { requireRestaurantId } from '../../common/authz';
import type { RequestContext } from '../../common/types';
import type { Database, PrismaExecutor } from '../../database/prisma';
import { lineSubtotal } from '../../utils/decimal';
import type { ProductRepository } from '../products/product.repository';
import type { ProductPriceRepository } from '../pricing/price.repository';
import type { CartItemRepository, CartRepository } from './cart.repository';
import { toCartDto } from './cart.mapper';
import type { CartDto, CartWithItems } from './cart.types';
import type { AddCartItemInput, UpdateCartItemInput } from './cart.schemas';

export class CartService {
  constructor(
    private readonly db: Database,
    private readonly carts: CartRepository,
    private readonly cartItems: CartItemRepository,
    private readonly products: ProductRepository,
    private readonly prices: ProductPriceRepository,
  ) {}

  async getCart(ctx: RequestContext): Promise<CartDto> {
    const restaurantId = requireRestaurantId(ctx);
    const cart = await this.getOrCreateActiveCart(restaurantId);
    return toCartDto(cart);
  }

  async addItem(ctx: RequestContext, input: AddCartItemInput): Promise<CartDto> {
    const restaurantId = requireRestaurantId(ctx);

    const product = await this.products.findById(input.productId);
    if (!product || product.status !== 'ACTIVE') {
      throw new ValidationError('Product is not available', [
        { field: 'productId', message: 'Product not found or not active' },
      ]);
    }
    const currentPrice = await this.prices.findCurrent(input.productId);
    if (!currentPrice) {
      throw new ValidationError('Product has no current price', [
        { field: 'productId', message: 'Product is not purchasable yet' },
      ]);
    }

    await this.db.$transaction(async (tx) => {
      const cart = await this.getOrCreateActiveCart(restaurantId, tx);
      const existing = await this.cartItems.findActive(cart.id, input.productId, tx);
      const quantity = new Prisma.Decimal(input.quantity);

      if (existing) {
        const newQuantity = existing.quantity.plus(quantity);
        await this.cartItems.update(
          existing.id,
          {
            quantity: newQuantity,
            unitPriceSnapshot: currentPrice.price,
            subtotal: lineSubtotal(newQuantity, currentPrice.price),
          },
          tx,
        );
      } else {
        await this.cartItems.create(
          {
            cartId: cart.id,
            productId: input.productId,
            quantity,
            unitPriceSnapshot: currentPrice.price,
            subtotal: lineSubtotal(quantity, currentPrice.price),
          },
          tx,
        );
      }
    });

    return toCartDto(await this.getOrCreateActiveCart(restaurantId));
  }

  async updateItem(
    ctx: RequestContext,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<CartDto> {
    const restaurantId = requireRestaurantId(ctx);
    const cart = await this.getOrCreateActiveCart(restaurantId);
    const item = cart.items.find((cartItem) => cartItem.id === itemId);
    if (!item) {
      throw new NotFoundError('Cart item not found');
    }

    const quantity = new Prisma.Decimal(input.quantity);
    await this.cartItems.update(item.id, {
      quantity,
      unitPriceSnapshot: item.unitPriceSnapshot,
      subtotal: lineSubtotal(quantity, item.unitPriceSnapshot),
    });

    return toCartDto(await this.getOrCreateActiveCart(restaurantId));
  }

  async removeItem(ctx: RequestContext, itemId: string): Promise<CartDto> {
    const restaurantId = requireRestaurantId(ctx);
    const cart = await this.getOrCreateActiveCart(restaurantId);
    const item = cart.items.find((cartItem) => cartItem.id === itemId);
    if (!item) {
      throw new NotFoundError('Cart item not found');
    }
    await this.cartItems.softDelete(item.id);
    return toCartDto(await this.getOrCreateActiveCart(restaurantId));
  }

  private async getOrCreateActiveCart(
    restaurantId: string,
    tx?: PrismaExecutor,
  ): Promise<CartWithItems> {
    const existing = await this.carts.getActiveByRestaurant(restaurantId, tx);
    if (existing) {
      return existing;
    }
    await this.carts.create(restaurantId, tx);
    const created = await this.carts.getActiveByRestaurant(restaurantId, tx);
    if (!created) {
      // Should never happen: we just created it.
      throw new NotFoundError('Active cart could not be created');
    }
    return created;
  }
}
