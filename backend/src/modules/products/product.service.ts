import type { Prisma, Product } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { assertAdmin, isPrivileged } from '../../common/authz';
import { DuplicateResourceError, InternalError, NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { CategoryRepository } from '../categories/category.repository';
import type { ProductRepository } from './product.repository';
import { toProductDto } from './product.mapper';
import type { ProductDto, ProductWithRelations } from './product.types';
import type {
  ChangeProductStatusInput,
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from './product.schemas';

const SORTABLE_FIELDS = ['createdAt', 'name', 'status'] as const;

/**
 * Master-catalog products are platform-controlled (project-working.md PRODUCT
 * MANAGEMENT): only Admin can create/edit/delete; Administration + Admin can
 * approve/reject. Restaurants and vendors only ever see APPROVED products.
 */
export class ProductService {
  constructor(
    private readonly db: Database,
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async getById(id: string, ctx: RequestContext): Promise<ProductDto> {
    const product = await this.products.findByIdWithRelations(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (product.status !== 'APPROVED' && !isPrivileged(ctx)) {
      throw new NotFoundError('Product not found');
    }
    return toProductDto(product);
  }

  async list(
    query: ListProductsQueryInput,
    ctx: RequestContext,
  ): Promise<{ items: ProductDto[]; pagination: PaginationMeta }> {
    const where: Prisma.ProductWhereInput = {};
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }
    if (query.inStock) {
      where.offers = { some: { status: 'APPROVED', deletedAt: null, availableQuantity: { gt: 0 } } };
    }

    if (isPrivileged(ctx)) {
      // Admin / Administration see the full catalog and may filter by status.
      if (query.status) {
        where.status = query.status;
      }
    } else {
      // Restaurants and vendors only ever see the approved storefront.
      where.status = 'APPROVED';
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.ProductOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.products.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toProductDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async create(input: CreateProductInput, ctx: RequestContext): Promise<ProductDto> {
    assertAdmin(ctx);

    const category = await this.categories.findById(input.categoryId);
    if (!category) {
      throw new NotFoundError('Category not found');
    }
    if (await this.products.existsSku(input.sku)) {
      throw new DuplicateResourceError('A product with this SKU already exists', [
        { field: 'sku', message: 'SKU must be unique across the catalog' },
      ]);
    }

    const created = await this.db.$transaction(async (tx) => {
      const product = await this.products.create(
        {
          categoryId: input.categoryId,
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          brand: input.brand ?? null,
          status: 'DRAFT',
          isFeatured: input.isFeatured,
          ...(input.transportPercent !== undefined ? { transportPercent: input.transportPercent } : {}),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'product',
          entityId: product.id,
          action: AUDIT_ACTIONS.PRODUCT_CREATED,
          newValue: { sku: product.sku, name: product.name },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return product;
    });

    this.logger.info({ productId: created.id }, 'master product created');
    return this.requireWithRelations(created.id);
  }

  async update(id: string, input: UpdateProductInput, ctx: RequestContext): Promise<ProductDto> {
    assertAdmin(ctx);
    await this.ensureExists(id);

    if (input.categoryId) {
      const category = await this.categories.findById(input.categoryId);
      if (!category) {
        throw new NotFoundError('Category not found');
      }
    }

    await this.products.update(id, {
      name: input.name,
      description: input.description,
      brand: input.brand,
      unit: input.unit,
      category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
      isFeatured: input.isFeatured,
      transportPercent: input.transportPercent,
      updatedBy: ctx.userId,
    });

    await this.audit.record({
      userId: ctx.userId,
      entityType: 'product',
      entityId: id,
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      newValue: input,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return this.requireWithRelations(id);
  }

  /** Approve / reject / (de)activate a product (Administration or Admin). */
  async changeStatus(
    id: string,
    input: ChangeProductStatusInput,
    ctx: RequestContext,
  ): Promise<ProductDto> {
    const product = await this.ensureExists(id);

    await this.products.update(id, { status: input.status, updatedBy: ctx.userId });
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'product',
      entityId: id,
      action: AUDIT_ACTIONS.PRODUCT_STATUS_CHANGED,
      oldValue: { status: product.status },
      newValue: { status: input.status, remarks: input.remarks ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return this.requireWithRelations(id);
  }

  async delete(id: string, ctx: RequestContext): Promise<void> {
    assertAdmin(ctx);
    await this.ensureExists(id);
    await this.products.softDelete(id, ctx.userId);
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'product',
      entityId: id,
      action: AUDIT_ACTIONS.PRODUCT_DELETED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  private async ensureExists(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }

  private async requireWithRelations(id: string): Promise<ProductDto> {
    const product: ProductWithRelations | null = await this.products.findByIdWithRelations(id);
    if (!product) {
      throw new InternalError('Product not found after write');
    }
    return toProductDto(product);
  }
}
