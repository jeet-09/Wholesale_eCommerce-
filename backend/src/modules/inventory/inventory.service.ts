import type { Prisma } from '@prisma/client';

import { assertVendorAccess } from '../../common/authz';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { RequestContext } from '../../common/types';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { ProductRepository } from '../products/product.repository';
import type { InventoryRepository } from './inventory.repository';
import { toInventoryDto } from './inventory.mapper';
import type { InventoryDto } from './inventory.types';
import type { UpdateInventoryInput } from './inventory.schemas';

export class InventoryService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly products: ProductRepository,
    private readonly audit: AuditService,
  ) {}

  async getByProduct(productId: string, ctx: RequestContext): Promise<InventoryDto> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    const record = await this.inventory.findByProductId(productId);
    if (!record) {
      throw new NotFoundError('Inventory not found for this product');
    }
    // Vendors may only view their own stock; staff and restaurants (read) allowed.
    if (ctx.vendorId) {
      assertVendorAccess(ctx, product.vendorId);
    }
    return toInventoryDto(record);
  }

  async adjust(
    productId: string,
    input: UpdateInventoryInput,
    ctx: RequestContext,
  ): Promise<InventoryDto> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    assertVendorAccess(ctx, product.vendorId);

    const record = await this.inventory.findByProductId(productId);
    if (!record) {
      throw new NotFoundError('Inventory not found for this product');
    }

    if (
      input.maximumQuantity !== undefined &&
      input.maximumQuantity !== null &&
      input.availableQuantity !== undefined &&
      input.maximumQuantity < input.availableQuantity
    ) {
      throw new ValidationError('maximumQuantity cannot be less than availableQuantity', [
        { field: 'maximumQuantity', message: 'Must be greater than or equal to available quantity' },
      ]);
    }

    const data: Prisma.InventoryUpdateInput = {};
    if (input.availableQuantity !== undefined) {
      data.availableQuantity = input.availableQuantity;
    }
    if (input.minimumQuantity !== undefined) {
      data.minimumQuantity = input.minimumQuantity;
    }
    if (input.maximumQuantity !== undefined) {
      data.maximumQuantity = input.maximumQuantity;
    }

    const updated = await this.inventory.update(record.id, data);
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'inventory',
      entityId: updated.id,
      action: AUDIT_ACTIONS.INVENTORY_UPDATED,
      oldValue: {
        availableQuantity: record.availableQuantity.toString(),
        minimumQuantity: record.minimumQuantity.toString(),
      },
      newValue: input,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return toInventoryDto(updated);
  }
}
