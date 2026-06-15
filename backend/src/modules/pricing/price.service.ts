import { Prisma } from '@prisma/client';
import type { Product } from '@prisma/client';

import { DEFAULT_CURRENCY } from '../../common/constants';
import { NotFoundError, ValidationError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import { applyTransportMarkup, averageMoney, toMoneyString } from '../../utils/decimal';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { OfferRepository } from '../vendor-offers/offer.repository';
import type { ProductRepository } from '../products/product.repository';
import type { ProductPriceRepository } from './price.repository';
import { toPriceDto } from './price.mapper';
import type { PriceDto, PriceSuggestionDto } from './price.types';
import type { SetPriceInput } from './price.schemas';

/**
 * Selling-price control (project-working.md PRODUCT PRICING FLOW). The price
 * shown to restaurants is owned by Admin/Administration:
 *   suggested = avg(APPROVED vendor offers) × (1 + transportPercent/100)
 * which can be accepted as-is or overridden. History is append-only (Rule 6).
 */
export class PricingService {
  constructor(
    private readonly db: Database,
    private readonly prices: ProductPriceRepository,
    private readonly products: ProductRepository,
    private readonly offers: OfferRepository,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(productId: string): Promise<PriceDto> {
    await this.ensureProduct(productId);
    const current = await this.prices.findCurrent(productId);
    if (!current) {
      throw new NotFoundError('No selling price set for this product');
    }
    return toPriceDto(current);
  }

  /** The average-vendor-price + transport suggestion shown to Admin. */
  async getSuggestion(productId: string): Promise<PriceSuggestionDto> {
    const product = await this.ensureProduct(productId);
    const { averageVendorPrice, computedPrice, vendorCount } = await this.computeFromOffers(product);
    const current = await this.prices.findCurrent(productId);

    return {
      productId,
      vendorCount,
      averageVendorPrice: averageVendorPrice !== null ? toMoneyString(averageVendorPrice) : null,
      transportPercent: product.transportPercent.toFixed(2),
      computedPrice: computedPrice !== null ? toMoneyString(computedPrice) : null,
      currentPrice: current ? toMoneyString(current.price) : null,
      currency: current?.currency ?? DEFAULT_CURRENCY,
    };
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
   * Set the selling price: an explicit `price` overrides; omitting it accepts
   * the computed average + transport. Closes the current row and inserts a new
   * one in one transaction (append-only history).
   */
  async setPrice(productId: string, input: SetPriceInput, ctx: RequestContext): Promise<PriceDto> {
    const product = await this.ensureProduct(productId);
    const { averageVendorPrice, computedPrice, vendorCount } = await this.computeFromOffers(product);

    const isOverride = input.price !== undefined;
    let finalPrice: Prisma.Decimal;
    if (isOverride) {
      finalPrice = new Prisma.Decimal(input.price as number).toDecimalPlaces(2);
    } else {
      if (computedPrice === null) {
        throw new ValidationError(
          'No approved vendor offers to compute a price from — provide an explicit price',
          [{ field: 'price', message: 'Required when there are no vendor offers' }],
        );
      }
      finalPrice = computedPrice;
    }

    const previous = await this.prices.findCurrent(productId);
    const created = await this.db.$transaction(async (tx) => {
      const now = new Date();
      await this.prices.closeCurrent(productId, now, tx);
      const next = await this.prices.create(
        {
          productId,
          price: finalPrice,
          currency: input.currency,
          averageVendorPrice,
          transportPercent: product.transportPercent,
          isOverride,
          effectiveFrom: now,
          createdBy: ctx.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'product_price',
          entityId: next.id,
          action: AUDIT_ACTIONS.PRICE_CHANGED,
          oldValue: previous ? { price: previous.price.toString() } : null,
          newValue: {
            price: finalPrice.toFixed(2),
            currency: input.currency,
            isOverride,
            averageVendorPrice: averageVendorPrice?.toFixed(2) ?? null,
            vendorCount,
          },
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

  private async computeFromOffers(
    product: Product,
  ): Promise<{ averageVendorPrice: Prisma.Decimal | null; computedPrice: Prisma.Decimal | null; vendorCount: number }> {
    const offers = await this.offers.listApprovedForProduct(product.id);
    if (offers.length === 0) {
      return { averageVendorPrice: null, computedPrice: null, vendorCount: 0 };
    }
    const averageVendorPrice = averageMoney(offers.map((offer) => offer.vendorPrice));
    const computedPrice = applyTransportMarkup(averageVendorPrice, product.transportPercent);
    return { averageVendorPrice, computedPrice, vendorCount: offers.length };
  }

  private async ensureProduct(productId: string): Promise<Product> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }
}
