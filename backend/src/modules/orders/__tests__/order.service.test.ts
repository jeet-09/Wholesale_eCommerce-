import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsufficientStockError, OrderNotModifiableError } from '../../../common/errors';
import type { RequestContext } from '../../../common/types';
import type { Database } from '../../../database/prisma';
import type { CartRepository } from '../../cart/cart.repository';
import type { InventoryRepository } from '../../inventory/inventory.repository';
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

function vendorCtx(): RequestContext {
  return {
    requestId: 'req-test',
    userId: 'user-2',
    email: 'vendor@demo.local',
    roles: ['VENDOR'],
    permissions: [],
    organizationId: 'org-2',
    restaurantId: null,
    vendorId: 'vendor-1',
    ipAddress: null,
    userAgent: null,
  };
}

/** A cart line whose product belongs to `vendor-1` and is ACTIVE with a price. */
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
          status: 'ACTIVE',
          vendorId: 'vendor-1',
          prices: [{ price: new Prisma.Decimal('50.00') }],
          inventory: null,
        },
      },
    ],
  };
}

interface Mocks {
  db: Database;
  orders: OrderRepository;
  carts: CartRepository;
  inventory: InventoryRepository;
  outbox: OutboxRepository;
  settings: SettingRepository;
  audit: AuditService;
}

function buildService(): { service: OrderService; mocks: Mocks } {
  // $transaction runs the callback with a sentinel tx and propagates throws,
  // mirroring Prisma's "callback throws => ROLLBACK" semantics.
  const db = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  } as unknown as Database;

  const orders = {
    nextOrderNumber: vi.fn(),
    create: vi.fn(),
    createItems: vi.fn(),
    appendStatus: vi.fn(),
    updateStatusFields: vi.fn(),
    findByIdWithRelations: vi.fn(),
    list: vi.fn(),
  } as unknown as OrderRepository;

  const carts = {
    getActiveByRestaurant: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as CartRepository;

  const inventory = {
    findByProductId: vi.fn(),
    reserve: vi.fn(),
    release: vi.fn(),
    fulfil: vi.fn(),
  } as unknown as InventoryRepository;

  const outbox = { enqueue: vi.fn() } as unknown as OutboxRepository;

  const settings = {
    getNumber: vi.fn().mockResolvedValue(new Prisma.Decimal(0)),
  } as unknown as SettingRepository;

  const audit = { record: vi.fn() } as unknown as AuditService;

  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;

  const service = new OrderService(db, orders, carts, inventory, outbox, settings, audit, logger);
  return { service, mocks: { db, orders, carts, inventory, outbox, settings, audit } };
}

describe('OrderService.placeOrder rollback', () => {
  let ctx: RequestContext;

  beforeEach(() => {
    ctx = restaurantCtx();
  });

  it('throws InsufficientStockError and persists nothing when stock is short', async () => {
    const { service, mocks } = buildService();

    vi.mocked(mocks.carts.getActiveByRestaurant).mockResolvedValue(
      cartWithOneItem(10) as never,
    );
    // sellable = available(5) - reserved(0) = 5 < requested 10
    vi.mocked(mocks.inventory.findByProductId).mockResolvedValue({
      id: 'inv-1',
      productId: 'prod-1',
      availableQuantity: new Prisma.Decimal(5),
      reservedQuantity: new Prisma.Decimal(0),
      version: 0,
    } as never);

    await expect(service.placeOrder(ctx, {})).rejects.toBeInstanceOf(InsufficientStockError);

    // The transaction ran but its callback threw => rolled back.
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    // Nothing after the stock check should have executed/persisted.
    expect(mocks.inventory.reserve).not.toHaveBeenCalled();
    expect(mocks.orders.create).not.toHaveBeenCalled();
    expect(mocks.orders.createItems).not.toHaveBeenCalled();
    expect(mocks.outbox.enqueue).not.toHaveBeenCalled();
    expect(mocks.carts.updateStatus).not.toHaveBeenCalled();
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
});

describe('OrderService.updateStatus state machine', () => {
  it('rejects an illegal transition without starting a transaction', async () => {
    const { service, mocks } = buildService();
    vi.mocked(mocks.orders.findByIdWithRelations).mockResolvedValue({
      id: 'order-1',
      status: 'DELIVERED',
      vendorId: 'vendor-1',
      restaurantId: 'rest-1',
      items: [],
    } as never);

    await expect(
      service.updateStatus('order-1', { status: 'ACCEPTED' }, vendorCtx()),
    ).rejects.toBeInstanceOf(OrderNotModifiableError);

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.orders.updateStatusFields).not.toHaveBeenCalled();
  });
});
