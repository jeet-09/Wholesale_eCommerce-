import type { Prisma, Product } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { assertVendorAccess, isPrivileged, requireVendorId } from '../../common/authz';
import { DuplicateResourceError, InternalError, NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { CategoryRepository } from '../categories/category.repository';
import type { ProductPriceRepository } from '../pricing/price.repository';
import type { InventoryRepository } from '../inventory/inventory.repository';
import type { ProductRepository } from './product.repository';
import { toProductDto } from './product.mapper';
import type { ProductDto, ProductWithRelations } from './product.types';
import type {
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from './product.schemas';

const SORTABLE_FIELDS = ['createdAt', 'name', 'status'] as const;

export class ProductService {
  constructor(
    private readonly db: Database,
    private readonly products: ProductRepository,
    private readonly prices: ProductPriceRepository,
    private readonly inventory: InventoryRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async getById(id: string, ctx: RequestContext): Promise<ProductDto> {
    const product = await this.products.findByIdWithRelations(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    // Non-active products are only visible to their owner or platform staff.
    if (product.status !== 'ACTIVE' && !isPrivileged(ctx) && product.vendorId !== ctx.vendorId) {
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

    if (isPrivileged(ctx)) {
      if (query.status) {
        where.status = query.status;
      }
      if (query.vendorId) {
        where.vendorId = query.vendorId;
      }
    } else if (ctx.vendorId) {
      // Vendors see their own full catalog (any status).
      where.vendorId = ctx.vendorId;
      if (query.status) {
        where.status = query.status;
      }
    } else {
      // Restaurants and other buyers see only the active storefront.
      where.status = 'ACTIVE';
      if (query.vendorId) {
        where.vendorId = query.vendorId;
      }
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
    const vendorId = isPrivileged(ctx) && input.vendorId ? input.vendorId : requireVendorId(ctx);

    const category = await this.categories.findById(input.categoryId);
    if (!category) {
      throw new NotFoundError('Category not found');
    }
    if (await this.products.existsSkuForVendor(vendorId, input.sku)) {
      throw new DuplicateResourceError('A product with this SKU already exists for the vendor', [
        { field: 'sku', message: 'SKU must be unique per vendor' },
      ]);
    }

    const created = await this.db.$transaction(async (tx) => {
      const product = await this.products.create(
        {
          vendorId,
          categoryId: input.categoryId,
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          brand: input.brand ?? null,
          status: input.status,
          isFeatured: input.isFeatured,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        tx,
      );
      await this.prices.create(
        { productId: product.id, price: input.price, currency: input.currency, createdBy: ctx.userId },
        tx,
      );
      await this.inventory.create(
        { productId: product.id, availableQuantity: input.initialStock, minimumQuantity: input.minimumStock },
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

    this.logger.info({ productId: created.id, vendorId }, 'product created');
    return this.requireWithRelations(created.id);
  }

  async update(id: string, input: UpdateProductInput, ctx: RequestContext): Promise<ProductDto> {
    const product = await this.ensureExists(id);
    assertVendorAccess(ctx, product.vendorId);

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
      category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
      status: input.status,
      isFeatured: input.isFeatured,
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

  async delete(id: string, ctx: RequestContext): Promise<void> {
    const product = await this.ensureExists(id);
    assertVendorAccess(ctx, product.vendorId);
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
