import type { Prisma } from '@prisma/client';
import type { Cart, CartItem, CartStatus } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';
import { cartInclude } from './cart.types';
import type { CartWithItems } from './cart.types';

export class CartRepository extends BaseRepository {
  getActiveByRestaurant(restaurantId: string, tx?: PrismaExecutor): Promise<CartWithItems | null> {
    return this.exec(tx).cart.findFirst({
      where: { restaurantId, status: 'ACTIVE', ...this.notDeleted },
      include: cartInclude,
    });
  }

  create(restaurantId: string, tx?: PrismaExecutor): Promise<Cart> {
    return this.exec(tx).cart.create({ data: { restaurantId, status: 'ACTIVE' } });
  }

  updateStatus(cartId: string, status: CartStatus, tx?: PrismaExecutor): Promise<Cart> {
    return this.exec(tx).cart.update({ where: { id: cartId }, data: { status } });
  }
}

export class CartItemRepository extends BaseRepository {
  findActive(cartId: string, productId: string, tx?: PrismaExecutor): Promise<CartItem | null> {
    return this.exec(tx).cartItem.findFirst({
      where: { cartId, productId, ...this.notDeleted },
    });
  }

  findById(id: string, tx?: PrismaExecutor): Promise<CartItem | null> {
    return this.exec(tx).cartItem.findFirst({ where: { id, ...this.notDeleted } });
  }

  create(
    input: {
      cartId: string;
      productId: string;
      quantity: Prisma.Decimal | number | string;
      unitPriceSnapshot: Prisma.Decimal | number | string;
      subtotal: Prisma.Decimal | number | string;
    },
    tx?: PrismaExecutor,
  ): Promise<CartItem> {
    return this.exec(tx).cartItem.create({ data: input });
  }

  update(
    id: string,
    data: {
      quantity: Prisma.Decimal | number | string;
      unitPriceSnapshot: Prisma.Decimal | number | string;
      subtotal: Prisma.Decimal | number | string;
    },
    tx?: PrismaExecutor,
  ): Promise<CartItem> {
    return this.exec(tx).cartItem.update({ where: { id }, data });
  }

  softDelete(id: string, tx?: PrismaExecutor): Promise<CartItem> {
    return this.exec(tx).cartItem.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
