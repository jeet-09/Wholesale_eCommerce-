import type { Prisma, Restaurant } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import type { CreateRestaurantData } from './restaurant.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.RestaurantWhereInput;
  orderBy: Prisma.RestaurantOrderByWithRelationInput[];
}

export class RestaurantRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Restaurant | null> {
    return this.exec(tx).restaurant.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByOrganizationId(organizationId: string, tx?: PrismaExecutor): Promise<Restaurant | null> {
    return this.exec(tx).restaurant.findFirst({ where: { organizationId, ...this.notDeleted } });
  }

  create(data: CreateRestaurantData, tx?: PrismaExecutor): Promise<Restaurant> {
    return this.exec(tx).restaurant.create({
      data: {
        organizationId: data.organizationId,
        restaurantName: data.restaurantName,
        licenseNumber: data.licenseNumber ?? null,
        cuisineType: data.cuisineType ?? null,
        status: data.status ?? 'PENDING',
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      },
    });
  }

  update(id: string, data: Prisma.RestaurantUpdateInput, tx?: PrismaExecutor): Promise<Restaurant> {
    return this.exec(tx).restaurant.update({ where: { id }, data });
  }

  async list(args: ListArgs): Promise<ListResult<Restaurant>> {
    const where: Prisma.RestaurantWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.restaurant.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
      }),
      this.db.restaurant.count({ where }),
    ]);
    return { items, total };
  }
}
