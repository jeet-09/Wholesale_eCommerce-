import type { Prisma } from '@prisma/client';

import { assertVendorAccess, isPrivileged, requireVendorId } from '../../common/authz';
import { InternalError, NotFoundError, ValidationError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { ProductRepository } from '../products/product.repository';
import type { OfferRepository } from './offer.repository';
import { toOfferDto } from './offer.mapper';
import type { OfferDto } from './offer.types';
import type {
  ListOffersQueryInput,
  ReviewOfferInput,
  SubmitOfferInput,
  UpdateOfferInput,
} from './offer.schemas';

/**
 * Vendor price/stock offers against the master catalog (project-working.md
 * PRODUCT PRICING FLOW). Vendors submit a price + available quantity for an
 * APPROVED product; Administration/Admin approve them; APPROVED offers feed the
 * average-price calculation in the pricing module.
 */
export class OfferService {
  constructor(
    private readonly db: Database,
    private readonly offers: OfferRepository,
    private readonly products: ProductRepository,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListOffersQueryInput,
    ctx: RequestContext,
  ): Promise<{ items: OfferDto[]; pagination: PaginationMeta }> {
    const where: Prisma.VendorProductOfferWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.productId) {
      where.productId = query.productId;
    }

    if (isPrivileged(ctx)) {
      if (query.vendorId) {
        where.vendorId = query.vendorId;
      }
    } else {
      // Vendors only ever see their own offers.
      where.vendorId = requireVendorId(ctx);
    }

    const { skip, take } = toPaginationArgs(query);
    const result = await this.offers.list({ skip, take, where });
    return {
      items: result.items.map(toOfferDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  /** Approved offers for one product — powers the vendor-assignment screen. */
  async listForProduct(productId: string): Promise<OfferDto[]> {
    const offers = await this.offers.listApprovedForProduct(productId);
    return offers.map(toOfferDto);
  }

  async getById(id: string, ctx: RequestContext): Promise<OfferDto> {
    const offer = await this.offers.findByIdWithRelations(id);
    if (!offer) {
      throw new NotFoundError('Offer not found');
    }
    if (!isPrivileged(ctx)) {
      assertVendorAccess(ctx, offer.vendorId);
    }
    return toOfferDto(offer);
  }

  /** Vendor submits (creates or replaces) their price + stock for a product. */
  async submit(input: SubmitOfferInput, ctx: RequestContext): Promise<OfferDto> {
    const vendorId = requireVendorId(ctx);

    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (product.status !== 'APPROVED') {
      throw new ValidationError('You can only price approved catalog products');
    }

    const existing = await this.offers.findByVendorAndProduct(vendorId, input.productId);
    const offerId = await this.db.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        const updated = await this.offers.update(
          existing.id,
          {
            vendorPrice: input.vendorPrice,
            availableQuantity: input.availableQuantity,
            currency: input.currency,
            status: 'PENDING',
            updatedBy: ctx.userId,
          },
          tx,
        );
        id = updated.id;
      } else {
        const created = await this.offers.create(
          {
            vendorId,
            productId: input.productId,
            vendorPrice: input.vendorPrice,
            availableQuantity: input.availableQuantity,
            currency: input.currency,
            status: 'PENDING',
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
          tx,
        );
        id = created.id;
      }
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'vendor_offer',
          entityId: id,
          action: AUDIT_ACTIONS.OFFER_SUBMITTED,
          newValue: {
            productId: input.productId,
            vendorPrice: String(input.vendorPrice),
            availableQuantity: String(input.availableQuantity),
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return id;
    });

    return this.requireWithRelations(offerId);
  }

  /** Vendor updates the price / available quantity of their own offer. */
  async update(id: string, input: UpdateOfferInput, ctx: RequestContext): Promise<OfferDto> {
    const offer = await this.offers.findById(id);
    if (!offer) {
      throw new NotFoundError('Offer not found');
    }
    assertVendorAccess(ctx, offer.vendorId);

    await this.offers.update(id, {
      vendorPrice: input.vendorPrice,
      availableQuantity: input.availableQuantity,
      updatedBy: ctx.userId,
    });
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'vendor_offer',
      entityId: id,
      action: AUDIT_ACTIONS.OFFER_UPDATED,
      newValue: input,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return this.requireWithRelations(id);
  }

  /** Administration/Admin approves, rejects, or deactivates an offer. */
  async review(id: string, input: ReviewOfferInput, ctx: RequestContext): Promise<OfferDto> {
    const offer = await this.offers.findById(id);
    if (!offer) {
      throw new NotFoundError('Offer not found');
    }

    await this.offers.setStatus(id, input.status, ctx.userId);
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'vendor_offer',
      entityId: id,
      action: AUDIT_ACTIONS.OFFER_STATUS_CHANGED,
      oldValue: { status: offer.status },
      newValue: { status: input.status, remarks: input.remarks ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return this.requireWithRelations(id);
  }

  private async requireWithRelations(id: string): Promise<OfferDto> {
    const offer = await this.offers.findByIdWithRelations(id);
    if (!offer) {
      throw new InternalError('Offer not found after write');
    }
    return toOfferDto(offer);
  }
}
