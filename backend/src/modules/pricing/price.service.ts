import { assertVendorAccess } from '../../common/authz';
import { NotFoundError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { ProductRepository } from '../products/product.repository';
import type { ProductPriceRepository } from './price.repository';
import { toPriceDto } from './price.mapper';
import type { PriceDto } from './price.types';
import type { ChangePriceInput } from './price.schemas';

export class PricingService {
  constructor(
    private readonly db: Database,
    private readonly prices: ProductPriceRepository,
    private readonly products: ProductRepository,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(productId: string): Promise<PriceDto> {
    await this.ensureProduct(productId);
    const current = await this.prices.findCurrent(productId);
    if (!current) {
      throw new NotFoundError('No current price set for this product');
    }
    return toPriceDto(current);
  }

  async listHistory(
    productId: string,
    query: { page: number; pageSize: number },
  ): Promise<{ items: PriceDto[]; pagination: PaginationMeta }> {
    await this.ensureProduct(productId);
    const { skip, take } = toPaginationArgs(query);
    const result = await this.prices.listByProduct(productId, { skip, take });
    return {
      items: result.items.map(toPriceDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  /**
   * Change a product's price: close the current row and insert a new one in a
   * single transaction (append-only history, Rule 6). Never an in-place update.
   */
  async changePrice(
    productId: string,
    input: ChangePriceInput,
    ctx: RequestContext,
  ): Promise<PriceDto> {
    const product = await this.ensureProduct(productId);
    assertVendorAccess(ctx, product.vendorId);

    const previous = await this.prices.findCurrent(productId);

    const created = await this.db.$transaction(async (tx) => {
      const now = new Date();
      await this.prices.closeCurrent(productId, now, tx);
      const next = await this.prices.create(
        { productId, price: input.price, currency: input.currency, effectiveFrom: now, createdBy: ctx.userId },
        tx,
      );
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'product_price',
          entityId: next.id,
          action: AUDIT_ACTIONS.PRICE_CHANGED,
          oldValue: previous ? { price: previous.price.toString() } : null,
          newValue: { price: String(input.price), currency: input.currency },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return next;
    });

    return toPriceDto(created);
  }

  private async ensureProduct(productId: string): Promise<{ id: string; vendorId: string }> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }
}
