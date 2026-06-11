import type { Category, Prisma } from '@prisma/client';

import { ConflictError, DuplicateResourceError, NotFoundError, ValidationError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import { slugify } from '../../utils/slug';
import type { CategoryRepository } from './category.repository';
import { toCategoryDto } from './category.mapper';
import type { CategoryDto } from './category.types';
import type {
  CreateCategoryInput,
  ListCategoriesQueryInput,
  UpdateCategoryInput,
} from './category.schemas';

const SORTABLE_FIELDS = ['displayOrder', 'name', 'createdAt'] as const;

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async getById(id: string): Promise<CategoryDto> {
    return toCategoryDto(await this.ensureExists(id));
  }

  async list(
    query: ListCategoriesQueryInput,
  ): Promise<{ items: CategoryDto[]; pagination: PaginationMeta }> {
    const where: Prisma.CategoryWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.parentCategoryId) {
      where.parentCategoryId = query.parentCategoryId;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'displayOrder',
      direction: 'asc',
    }).map((sort) => ({ [sort.field]: sort.direction })) as Prisma.CategoryOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.categories.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toCategoryDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async create(input: CreateCategoryInput, ctx: RequestContext): Promise<CategoryDto> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) {
      throw new ValidationError('Could not derive a slug from the name', [
        { field: 'slug', message: 'Provide an explicit slug' },
      ]);
    }
    if (await this.categories.findBySlug(slug)) {
      throw new DuplicateResourceError('A category with this slug already exists', [
        { field: 'slug', message: 'Slug is already in use' },
      ]);
    }
    if (input.parentCategoryId) {
      await this.ensureExists(input.parentCategoryId);
    }

    const created = await this.categories.create({
      name: input.name,
      description: input.description ?? null,
      slug,
      parentCategoryId: input.parentCategoryId ?? null,
      displayOrder: input.displayOrder,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return toCategoryDto(created);
  }

  async update(id: string, input: UpdateCategoryInput, ctx: RequestContext): Promise<CategoryDto> {
    await this.ensureExists(id);
    if (input.parentCategoryId) {
      if (input.parentCategoryId === id) {
        throw new ValidationError('A category cannot be its own parent', [
          { field: 'parentCategoryId', message: 'Invalid parent' },
        ]);
      }
      await this.ensureExists(input.parentCategoryId);
    }

    const updated = await this.categories.update(id, {
      name: input.name,
      description: input.description,
      parentCategoryId:
        input.parentCategoryId === undefined ? undefined : input.parentCategoryId,
      displayOrder: input.displayOrder,
      status: input.status,
      updatedBy: ctx.userId,
    });
    return toCategoryDto(updated);
  }

  async delete(id: string, ctx: RequestContext): Promise<void> {
    await this.ensureExists(id);
    const childCount = await this.categories.countChildren(id);
    if (childCount > 0) {
      throw new ConflictError('Cannot delete a category that has subcategories');
    }
    await this.categories.softDelete(id, ctx.userId);
  }

  private async ensureExists(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundError('Category not found');
    }
    return category;
  }
}
