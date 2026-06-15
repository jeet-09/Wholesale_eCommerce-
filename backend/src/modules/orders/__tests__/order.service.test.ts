import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderNotModifiableError, ValidationError } from '../../../common/errors';
import type { RequestContext } from '../../../common/types';
import type { Database } from '../../../database/prisma';
import type { CartRepository } from '../../cart/cart.repository';
import type { OfferRepository } from '../../vendor-offers/offer.repository';
import type { PerformanceRepository } from '../../vendor-performance/performance.repository';
import type { VendorRepository } from '../../vendors/vendor.repository';
import type { SettingRepository } from '../../settings/setting.repository';
import type { AuditService } from '../../audit/audit.service';
import { OrderService } from '../order.service';
import type { OrderRepository } from '../order.repository';
import type { OutboxRepository } from '../outbox.repository';

function restaurantCtx(): RequestContext {
  return {
    requestId: 'req-test',
    userId: 'user-1',
    email: 'restaurant@demo.local',
    roles: ['RESTAURANT'],
    permissions: [],
    organizationId: 'org-1',
    restaurantId: 'rest-1',
    vendorId: null,
    ipAddress: null,
    userAgent: null,
  };
}

function adminCtx(): RequestContext {
  return {
    requestId: 'req-test',
    userId: 'admin-1',
    email: 'ops@demo.local',
    roles: ['OPERATIONS'],
    permissions: [],
    organizationId: null,
    restaurantId: null,
    vendorId: null,
    ipAddress: null,
    userAgent: null,
  };
}

/** A cart line whose master product is APPROVED with a current selling price. */
function cartWithOneItem(quantity: number) {
  return {
    id: 'cart-1',
    items: [
      {
        id: 'ci-1',
        quantity: new Prisma.Decimal(quantity),
        product: {
          id: 'prod-1',
          name: 'Tomatoes',
          sku: 'SKU-1',
          unit: 'KG',
          status: 'APPROVED',
          prices: [{ price: new Prisma.Decimal('50.00') }],
        },
      },
    ],
  };
}

/** A complete order graph good enough for toOrderDto. */
function fullOrder(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'order-1',
    orderNumber: 'ORD-2026-000001',
    restaurantId: 'rest-1',
    assignedVendorId: null,
    status: 'PENDING_PAYMENT',
    currency: 'INR',
    subtotal: new Prisma.Decimal('500.00'),
    discountAmount: new Prisma.Decimal('0.00'),
    gstAmount: new Prisma.Decimal('0.00'),
    deliveryCharges: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('500.00'),
    advancePercent: new Prisma.Decimal('30'),
    advanceAmount: new Prisma.Decimal('150.00'),
    remainingAmount: new Prisma.Decimal('350.00'),
    placedAt: now,
    paymentSubmittedAt: null,
    paymentVerifiedAt: null,
    reviewedAt: null,
    assignedAt: null,
    acceptedAt: null,
    readyAt: null,
    deliveredAt: null,
    completedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    items: [],
    statusHistory: [],
    payments: [],
    assignedVendor: null,
    restaurant: { id: 'rest-1', restaurantName: 'Demo Bistro' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface Mocks {
  db: Database;
  orders: OrderRepository;
  carts: CartRepository;
  offers: OfferRepository;
  performance: PerformanceRepository;
  vendors: VendorRepository;
  outbox: OutboxRepository;
  settings: SettingRepository;
  audit: AuditService;
}

function buildService(): { service: OrderService; mocks: Mocks } {
  const db = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  } as unknown as Database;

  const orders = {
    nextOrderNumber: vi.fn().mockResolvedValue(1n),
    create: vi.fn().mockResolvedValue({ id: 'order-1' }),
    createItems: vi.fn(),
    appendStatus: vi.fn(),
    updateStatusFields: vi.fn(),
    findById: vi.fn(),
    findByIdWithRelations: vi.fn(),
    list: vi.fn(),
  } as unknown as OrderRepository;

  const carts = {
    getActiveByRestaurant: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as CartRepository;

  const offers = {
    findByVendorAndProduct: vi.fn(),
    reserve: vi.fn(),
    release: vi.fn(),
    fulfil: vi.fn(),
  } as unknown as OfferRepository;

  const performance = {
    ensure: vi.fn(),
    increment: vi.fn(),
  } as unknown as PerformanceRepository;

  const vendors = {
    findById: vi.fn(),
  } as unknown as VendorRepository;

  const outbox = { enqueue: vi.fn() } as unknown as OutboxRepository;

  const settings = {
    getNumber: vi.fn().mockImplementation((_key: string, fallback: number) =>
      Promise.resolve(new Prisma.Decimal(fallback)),
    ),
  } as unknown as SettingRepository;

  const audit = { record: vi.fn() } as unknown as AuditService;

  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;

  const service = new OrderService(
    db,
    orders,
    carts,
    offers,
    performance,
    vendors,
    outbox,
    settings,
    audit,
    logger,
  );
  return {
    service,
    mocks: { db, orders, carts, offers, performance, vendors, outbox, settings, audit },
  };
}

describe('OrderService.placeOrder', () => {
  let ctx: RequestContext;

  beforeEach(() => {
    ctx = restaurantCtx();
  });

  it('rejects an empty cart without opening writes', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.carts.getActiveByRestaurant).mockResolvedValue({
      id: 'cart-1',
      items: [],
    } as never);

    await expect(service.placeOrder(ctx, {})).rejects.toThrow();
    expect(mocks.orders.create).not.toHaveBeenCalled();
    expect(mocks.carts.updateStatus).not.toHaveBeenCalled();
  });

  it('creates a PENDING_PAYMENT order with a 30% advance and no vendor', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.carts.getActiveByRestaurant).mockResolvedValue(cartWithOneItem(10) as never);
    vi.mocked(mocks.settings.getNumber).mockImplementation((key: string) =>
      Promise.resolve(new Prisma.Decimal(key === 'ADVANCE_PERCENTAGE' ? 30 : 0)),
    );
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(fullOrder() as never);

    const dto = await service.placeOrder(ctx, {});

    expect(mocks.orders.create).toHaveBeenCalledTimes(1);
    const createArg = vi.mocked(mocks.orders.create).mock.calls[0]![0] as {
      status: string;
      totalAmount: Prisma.Decimal;
      advanceAmount: Prisma.Decimal;
    };
    expect(createArg.status).toBe('PENDING_PAYMENT');
    // subtotal = 10 * 50 = 500; gst/delivery = 0; total = 500; advance = 30% = 150
    expect(createArg.totalAmount.toFixed(2)).toBe('500.00');
    expect(createArg.advanceAmount.toFixed(2)).toBe('150.00');
    expect(mocks.carts.updateStatus).toHaveBeenCalledWith('cart-1', 'CHECKED_OUT', expect.anything());
    expect(dto.status).toBe('PENDING_PAYMENT');
  });
});

describe('OrderService.assignVendor', () => {
  it('rejects assignment when the vendor does not supply an item', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({
        status: 'PENDING_ADMIN_REVIEW',
        items: [{ productId: 'prod-1', productName: 'Tomatoes', quantity: new Prisma.Decimal(10) }],
      }) as never,
    );
    vi.mocked(mocks.vendors.findById).mockResolvedValue({
      id: 'vendor-1',
      status: 'ACTIVE',
      deletedAt: null,
    } as never);
    // No approved offer for this vendor/product.
    vi.mocked(mocks.offers.findByVendorAndProduct).mockResolvedValue(null);

    await expect(
      service.assignVendor('order-1', { vendorId: 'vendor-1' }, adminCtx()),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mocks.offers.reserve).not.toHaveBeenCalled();
  });
});

describe('OrderService state machine', () => {
  it('rejects completing an order that is not delivered', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'PENDING_PAYMENT' }) as never,
    );

    await expect(service.complete('order-1', {}, adminCtx())).rejects.toBeInstanceOf(
      OrderNotModifiableError,
    );

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.orders.updateStatusFields).not.toHaveBeenCalled();
  });
});
