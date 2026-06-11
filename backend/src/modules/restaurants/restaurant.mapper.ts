import type { Restaurant } from '@prisma/client';

import { toMoneyString } from '../../utils/decimal';
import type { RestaurantDto } from './restaurant.types';

export function toRestaurantDto(restaurant: Restaurant): RestaurantDto {
  return {
    id: restaurant.id,
    organizationId: restaurant.organizationId,
    restaurantName: restaurant.restaurantName,
    licenseNumber: restaurant.licenseNumber,
    cuisineType: restaurant.cuisineType,
    averageMonthlyProcurement: restaurant.averageMonthlyProcurement
      ? toMoneyString(restaurant.averageMonthlyProcurement)
      : null,
    status: restaurant.status,
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}
