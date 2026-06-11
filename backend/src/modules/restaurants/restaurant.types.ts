export interface RestaurantDto {
  id: string;
  organizationId: string;
  restaurantName: string;
  licenseNumber: string | null;
  cuisineType: string | null;
  averageMonthlyProcurement: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRestaurantData {
  organizationId: string;
  restaurantName: string;
  licenseNumber?: string | null;
  cuisineType?: string | null;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  createdBy?: string | null;
}
