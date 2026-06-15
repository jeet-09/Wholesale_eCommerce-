import type { Prisma, OrderStatus } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';

export interface StatusCount {
  status: string;
  count: number;
}

/**
 * Read-only aggregate queries powering the role dashboards. Everything is a
 * COUNT or GROUP BY so the dashboard stays cheap regardless of data volume.
 */
export class AnalyticsRepository extends BaseRepository {
  async ordersByStatus(where: Prisma.OrderWhereInput): Promise<StatusCount[]> {
    const rows = await this.db.order.groupBy({
      by: ['status'],
      where: { ...where, ...this.notDeleted },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  countOrders(where: Prisma.OrderWhereInput): Promise<number> {
    return this.db.order.count({ where: { ...where, ...this.notDeleted } });
  }

  countOrdersInStatuses(
    statuses: OrderStatus[],
    where: Prisma.OrderWhereInput,
  ): Promise<number> {
    return this.db.order.count({
      where: { ...where, status: { in: statuses }, ...this.notDeleted },
    });
  }

  countPayments(where: Prisma.PaymentWhereInput): Promise<number> {
    return this.db.payment.count({ where: { ...where, ...this.notDeleted } });
  }

  countProducts(where: Prisma.ProductWhereInput): Promise<number> {
    return this.db.product.count({ where: { ...where, ...this.notDeleted } });
  }

  countOffers(where: Prisma.VendorProductOfferWhereInput): Promise<number> {
    return this.db.vendorProductOffer.count({ where: { ...where, ...this.notDeleted } });
  }

  countVendors(where: Prisma.VendorWhereInput): Promise<number> {
    return this.db.vendor.count({ where: { ...where, ...this.notDeleted } });
  }

  countRestaurants(where: Prisma.RestaurantWhereInput): Promise<number> {
    return this.db.restaurant.count({ where: { ...where, ...this.notDeleted } });
  }
}
