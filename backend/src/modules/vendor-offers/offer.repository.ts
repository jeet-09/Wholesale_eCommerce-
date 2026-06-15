import { Prisma } from '@prisma/client';
import type { VendorOfferStatus, VendorProductOffer } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { offerInclude } from './offer.types';
import type { OfferWithRelations } from './offer.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.VendorProductOfferWhereInput;
}

/**
 * Vendor offer persistence. Stock mutations (reserve/release/fulfil) use
 * OPTIMISTIC LOCKING on `version` (DATABASE.md C7): a guarded updateMany returns
 * 0 rows on a concurrent change, which the order service treats as a conflict
 * and rolls the transaction back.
 */
export class OfferRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<VendorProductOffer | null> {
    return this.exec(tx).vendorProductOffer.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByIdWithRelations(id: string, tx?: PrismaExecutor): Promise<OfferWithRelations | null> {
    return this.exec(tx).vendorProductOffer.findFirst({
      where: { id, ...this.notDeleted },
      include: offerInclude,
    });
  }

  findByVendorAndProduct(
    vendorId: string,
    productId: string,
    tx?: PrismaExecutor,
  ): Promise<VendorProductOffer | null> {
    return this.exec(tx).vendorProductOffer.findFirst({
      where: { vendorId, productId, ...this.notDeleted },
    });
  }

  /** Active, approved offers for a product (admin assignment + averaging). */
  listApprovedForProduct(productId: string, tx?: PrismaExecutor): Promise<OfferWithRelations[]> {
    return this.exec(tx).vendorProductOffer.findMany({
      where: { productId, status: 'APPROVED', ...this.notDeleted },
      include: offerInclude,
      orderBy: { vendorPrice: 'asc' },
    });
  }

  create(data: Prisma.VendorProductOfferUncheckedCreateInput, tx?: PrismaExecutor): Promise<VendorProductOffer> {
    return this.exec(tx).vendorProductOffer.create({ data });
  }

  update(
    id: string,
    data: Prisma.VendorProductOfferUpdateInput,
    tx?: PrismaExecutor,
  ): Promise<VendorProductOffer> {
    return this.exec(tx).vendorProductOffer.update({ where: { id }, data });
  }

  setStatus(
    id: string,
    status: VendorOfferStatus,
    updatedBy: string,
    tx?: PrismaExecutor,
  ): Promise<VendorProductOffer> {
    return this.exec(tx).vendorProductOffer.update({
      where: { id },
      data: { status, updatedBy },
    });
  }

  /** Reserve stock when Administration assigns this vendor. False on conflict. */
  async reserve(
    offer: VendorProductOffer,
    quantity: Prisma.Decimal,
    tx?: PrismaExecutor,
  ): Promise<boolean> {
    const newReserved = offer.reservedQuantity.plus(quantity);
    const result = await this.exec(tx).vendorProductOffer.updateMany({
      where: { id: offer.id, version: offer.version },
      data: { reservedQuantity: newReserved, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Release a reservation (vendor rejected / order cancelled). */
  async release(
    offer: VendorProductOffer,
    quantity: Prisma.Decimal,
    tx?: PrismaExecutor,
  ): Promise<boolean> {
    const next = offer.reservedQuantity.minus(quantity);
    const newReserved = next.isNegative() ? new Prisma.Decimal(0) : next;
    const result = await this.exec(tx).vendorProductOffer.updateMany({
      where: { id: offer.id, version: offer.version },
      data: { reservedQuantity: newReserved, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Fulfil on completion: decrement both available and reserved. */
  async fulfil(
    offer: VendorProductOffer,
    quantity: Prisma.Decimal,
    tx?: PrismaExecutor,
  ): Promise<boolean> {
    const newAvailable = offer.availableQuantity.minus(quantity);
    const reservedNext = offer.reservedQuantity.minus(quantity);
    const newReserved = reservedNext.isNegative() ? new Prisma.Decimal(0) : reservedNext;
    const result = await this.exec(tx).vendorProductOffer.updateMany({
      where: { id: offer.id, version: offer.version },
      data: {
        availableQuantity: newAvailable.isNegative() ? new Prisma.Decimal(0) : newAvailable,
        reservedQuantity: newReserved,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  async list(args: ListArgs): Promise<ListResult<OfferWithRelations>> {
    const where: Prisma.VendorProductOfferWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.vendorProductOffer.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: { createdAt: 'desc' },
        include: offerInclude,
      }),
      this.db.vendorProductOffer.count({ where }),
    ]);
    return { items, total };
  }
}
