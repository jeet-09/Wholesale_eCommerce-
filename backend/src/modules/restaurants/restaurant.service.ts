import type { Prisma, Restaurant } from '@prisma/client';

import { assertRestaurantAccess } from '../../common/authz';
import { NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { RestaurantRepository } from './restaurant.repository';
import { toRestaurantDto } from './restaurant.mapper';
import type { RestaurantDto } from './restaurant.types';
import type { ListRestaurantsQueryInput, UpdateRestaurantInput } from './restaurant.schemas';

const SORTABLE_FIELDS = ['createdAt', 'restaurantName', 'status'] as const;

export class RestaurantService {
  constructor(private readonly restaurants: RestaurantRepository) {}

  async getById(id: string): Promise<RestaurantDto> {
    return toRestaurantDto(await this.ensureExists(id));
  }

  async list(
    query: ListRestaurantsQueryInput,
  ): Promise<{ items: RestaurantDto[]; pagination: PaginationMeta }> {
    const where: Prisma.RestaurantWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.restaurantName = { contains: query.search, mode: 'insensitive' };
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.RestaurantOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.restaurants.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toRestaurantDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async update(
    id: string,
    input: UpdateRestaurantInput,
    ctx: RequestContext,
  ): Promise<RestaurantDto> {
    await this.ensureExists(id);
    assertRestaurantAccess(ctx, id);

    const data: Prisma.RestaurantUpdateInput = { updatedBy: ctx.userId };
    if (input.restaurantName !== undefined) {
      data.restaurantName = input.restaurantName;
    }
    if (input.licenseNumber !== undefined) {
      data.licenseNumber = input.licenseNumber;
    }
    if (input.cuisineType !== undefined) {
      data.cuisineType = input.cuisineType;
    }
    if (input.averageMonthlyProcurement !== undefined) {
      data.averageMonthlyProcurement = input.averageMonthlyProcurement;
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }

    const updated = await this.restaurants.update(id, data);
    return toRestaurantDto(updated);
  }

  private async ensureExists(id: string): Promise<Restaurant> {
    const restaurant = await this.restaurants.findById(id);
    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }
    return restaurant;
  }
}
