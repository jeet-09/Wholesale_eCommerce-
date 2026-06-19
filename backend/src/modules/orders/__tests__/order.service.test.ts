import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, OrderNotModifiableError, ValidationError } from '../../../common/errors';
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
import type { ListOrdersQueryInput } from '../order.schemas';

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

function vendorCtx(): RequestContext {
  return {
    requestId: 'req-test',
    userId: 'vendor-user-1',
    email: 'vendor@demo.local',
    roles: ['VENDOR'],
    permissions: [],
    organizationId: 'org-v1',
    restaurantId: null,
    vendorId: 'vendor-1',
    ipAddress: null,
    userAgent: null,
  };
}

/** A delivery date `n` days from today, formatted YYYY-MM-DD (server-local). */
function deliveryDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
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
    requestedDeliveryDate: now,
    isSameDayDelivery: false,
    sameDayCharge: new Prisma.Decimal('0.00'),
    deliveryContactPhone: null,
    dispatchNote: null,
    dispatchedAt: null,
    customerRating: null,
    customerReview: null,
    ratedAt: null,
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

/** A complete order-item snapshot good enough for toOrderDto. */
function orderItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'oi-1',
    productId: 'prod-1',
    productName: 'Tomatoes',
    sku: 'SKU-1',
    unit: 'KG',
    unitPrice: new Prisma.Decimal('50.00'),
    quantity: new Prisma.Decimal('10'),
    subtotal: new Prisma.Decimal('500.00'),
    deliveredQuantity: null,
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
    setItemDeliveredQuantity: vi.fn().mockResolvedValue(1),
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

    await expect(
      service.placeOrder(ctx, { requestedDeliveryDate: deliveryDate(2) }),
    ).rejects.toThrow();
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

    const dto = await service.placeOrder(ctx, { requestedDeliveryDate: deliveryDate(3) });

    expect(mocks.orders.create).toHaveBeenCalledTimes(1);
    const createArg = vi.mocked(mocks.orders.create).mock.calls[0]![0] as {
      status: string;
      totalAmount: Prisma.Decimal;
      advanceAmount: Prisma.Decimal;
      isSameDayDelivery: boolean;
    };
    expect(createArg.status).toBe('PENDING_PAYMENT');
    // subtotal = 10 * 50 = 500; gst/delivery = 0; total = 500; advance = 30% = 150
    expect(createArg.totalAmount.toFixed(2)).toBe('500.00');
    expect(createArg.advanceAmount.toFixed(2)).toBe('150.00');
    expect(createArg.isSameDayDelivery).toBe(false);
    expect(mocks.carts.updateStatus).toHaveBeenCalledWith('cart-1', 'CHECKED_OUT', expect.anything());
    expect(dto.status).toBe('PENDING_PAYMENT');
  });

  it('adds a same-day surcharge into delivery charges when delivery is today', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.carts.getActiveByRestaurant).mockResolvedValue(cartWithOneItem(10) as never);
    vi.mocked(mocks.settings.getNumber).mockImplementation((key: string) => {
      if (key === 'ADVANCE_PERCENTAGE') return Promise.resolve(new Prisma.Decimal(30));
      if (key === 'SAME_DAY_DELIVERY_SURCHARGE') return Promise.resolve(new Prisma.Decimal(150));
      return Promise.resolve(new Prisma.Decimal(0));
    });
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(fullOrder() as never);

    await service.placeOrder(ctx, { requestedDeliveryDate: deliveryDate(0) });

    const createArg = vi.mocked(mocks.orders.create).mock.calls[0]![0] as {
      totalAmount: Prisma.Decimal;
      deliveryCharges: Prisma.Decimal;
      sameDayCharge: Prisma.Decimal;
      isSameDayDelivery: boolean;
    };
    expect(createArg.isSameDayDelivery).toBe(true);
    expect(createArg.sameDayCharge.toFixed(2)).toBe('150.00');
    expect(createArg.deliveryCharges.toFixed(2)).toBe('150.00');
    // subtotal 500 + delivery 150 = 650
    expect(createArg.totalAmount.toFixed(2)).toBe('650.00');
  });

  it('rejects a delivery date in the past', async () => {
    const { service, mocks } = buildService();
    await expect(
      service.placeOrder(ctx, { requestedDeliveryDate: deliveryDate(-1) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a delivery date beyond the 20-day window', async () => {
    const { service, mocks } = buildService();
    await expect(
      service.placeOrder(ctx, { requestedDeliveryDate: deliveryDate(21) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
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

describe('OrderService.updateFulfilment (dispatch)', () => {
  it('records dispatch details + partial quantity when going OUT_FOR_DELIVERY', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({
        status: 'READY_FOR_DELIVERY',
        assignedVendorId: 'vendor-1',
        items: [orderItemRow({ id: 'oi-1' })],
      }) as never,
    );

    await service.updateFulfilment(
      'order-1',
      {
        status: 'OUT_FOR_DELIVERY',
        deliveryContactPhone: '+91 9876543210',
        dispatchNote: 'Only 8kg available',
        deliveredItems: [{ orderItemId: 'oi-1', deliveredQuantity: 8 }],
      },
      vendorCtx(),
    );

    expect(mocks.orders.setItemDeliveredQuantity).toHaveBeenCalledWith(
      'order-1',
      'oi-1',
      expect.anything(),
      expect.anything(),
    );
    const updateArg = vi.mocked(mocks.orders.updateStatusFields).mock.calls[0]![1] as {
      status: string;
      deliveryContactPhone: string | null;
      dispatchedAt: Date;
    };
    expect(updateArg.status).toBe('OUT_FOR_DELIVERY');
    expect(updateArg.deliveryContactPhone).toBe('+91 9876543210');
  });

  it('rejects a partial line that is not part of the order', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({
        status: 'READY_FOR_DELIVERY',
        assignedVendorId: 'vendor-1',
        items: [orderItemRow({ id: 'oi-1' })],
      }) as never,
    );

    await expect(
      service.updateFulfilment(
        'order-1',
        {
          status: 'OUT_FOR_DELIVERY',
          deliveryContactPhone: '+91 9876543210',
          deliveredItems: [{ orderItemId: 'oi-does-not-exist', deliveredQuantity: 5 }],
        },
        vendorCtx(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});

describe('OrderService.list (active vs archived board)', () => {
  it('filters the ARCHIVED group to terminal statuses', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.list).mockResolvedValue({ items: [], total: 0 });

    const query: ListOrdersQueryInput = {
      page: 1,
      pageSize: 10,
      statusGroup: 'ARCHIVED',
      sort: '-createdAt',
    };
    await service.list(query, adminCtx());

    expect(mocks.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] } }),
      }),
    );
  });

  it('filters the ACTIVE group to exclude terminal statuses', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.list).mockResolvedValue({ items: [], total: 0 });

    const query: ListOrdersQueryInput = {
      page: 1,
      pageSize: 10,
      statusGroup: 'ACTIVE',
      sort: '-createdAt',
    };
    await service.list(query, adminCtx());

    expect(mocks.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] } }),
      }),
    );
  });

  it('lets an explicit status filter win over the group', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.list).mockResolvedValue({ items: [], total: 0 });

    const query: ListOrdersQueryInput = {
      page: 1,
      pageSize: 10,
      status: 'DELIVERED',
      statusGroup: 'ARCHIVED',
      sort: '-createdAt',
    };
    await service.list(query, adminCtx());

    expect(mocks.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });
});

describe('OrderService.overrideStatus (admin super-power)', () => {
  it('forces a status that the normal state machine would forbid', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'PENDING_PAYMENT' }) as never,
    );

    // PENDING_PAYMENT -> PENDING_ADMIN_REVIEW is not a legal transition, but the
    // admin override skips the gate.
    await service.overrideStatus('order-1', { status: 'PENDING_ADMIN_REVIEW' }, adminCtx());

    const updateArg = vi.mocked(mocks.orders.updateStatusFields).mock.calls[0]![1] as {
      status: string;
      reviewedAt?: Date;
    };
    expect(updateArg.status).toBe('PENDING_ADMIN_REVIEW');
    expect(updateArg.reviewedAt).toBeInstanceOf(Date);
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_STATUS_OVERRIDDEN' }),
      expect.anything(),
    );
    expect(mocks.offers.release).not.toHaveBeenCalled();
  });

  it('releases reserved vendor stock when leaving a reserved status', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({
        status: 'VENDOR_ACCEPTED',
        assignedVendorId: 'vendor-1',
        items: [orderItemRow({ id: 'oi-1' })],
      }) as never,
    );
    vi.mocked(mocks.offers.findByVendorAndProduct).mockResolvedValue({ id: 'offer-1' } as never);
    vi.mocked(mocks.offers.release).mockResolvedValue(true);

    await service.overrideStatus('order-1', { status: 'CANCELLED' }, adminCtx());

    expect(mocks.offers.release).toHaveBeenCalled();
    expect(mocks.orders.updateStatusFields).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.anything(),
    );
  });

  it('rejects a no-op override to the current status', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'PROCESSING' }) as never,
    );

    await expect(
      service.overrideStatus('order-1', { status: 'PROCESSING' }, adminCtx()),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});

describe('OrderService.complete (restaurant review)', () => {
  it('requires a rating when the restaurant completes its own order', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'DELIVERED', assignedVendorId: 'vendor-1' }) as never,
    );

    await expect(service.complete('order-1', {}, restaurantCtx())).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a restaurant from completing another restaurant order', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'DELIVERED', restaurantId: 'other-rest', assignedVendorId: 'vendor-1' }) as never,
    );

    await expect(
      service.complete('order-1', { rating: 5 }, restaurantCtx()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('stores the customer rating + review and rolls vendor performance', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue(
      fullOrder({ status: 'DELIVERED', assignedVendorId: 'vendor-1' }) as never,
    );

    await service.complete('order-1', { rating: 5, review: 'Great, fresh produce!' }, restaurantCtx());

    const updateArg = vi.mocked(mocks.orders.updateStatusFields).mock.calls[0]![1] as {
      status: string;
      customerRating: number;
      customerReview: string;
    };
    expect(updateArg.status).toBe('COMPLETED');
    expect(updateArg.customerRating).toBe(5);
    expect(updateArg.customerReview).toBe('Great, fresh produce!');
    expect(mocks.performance.increment).toHaveBeenCalled();
  });
});
