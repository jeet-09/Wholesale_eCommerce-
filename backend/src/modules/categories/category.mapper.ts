import type { Category } from '@prisma/client';

import type { CategoryDto } from './category.types';

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    slug: category.slug,
    parentCategoryId: category.parentCategoryId,
    displayOrder: category.displayOrder,
    status: category.status,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
