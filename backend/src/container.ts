import type { FastifyBaseLogger } from 'fastify';

import type { Env } from './config/env';
import type { Database } from './database/prisma';
import { BcryptPasswordHasher } from './utils/password';
import type { AuthContextLoader } from './middleware/auth';
import type { IdempotencyStore } from './middleware/idempotency';
import type { AccessTokenSigner } from './modules/auth/token.types';

import { AuditRepository } from './modules/audit/audit.repository';
import { AuditService } from './modules/audit/audit.service';
import { AuditController } from './modules/audit/audit.controller';

import { UserRepository } from './modules/users/user.repository';
import { RoleRepository } from './modules/users/role.repository';
import { UserService } from './modules/users/user.service';
import { UserController } from './modules/users/user.controller';

import {
  OrganizationAddressRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
} from './modules/organizations/organization.repository';
import { OrganizationService } from './modules/organizations/organization.service';
import { OrganizationController } from './modules/organizations/organization.controller';

import { VendorRepository } from './modules/vendors/vendor.repository';
import { VendorService } from './modules/vendors/vendor.service';
import { VendorController } from './modules/vendors/vendor.controller';

import { RestaurantRepository } from './modules/restaurants/restaurant.repository';
import { RestaurantService } from './modules/restaurants/restaurant.service';
import { RestaurantController } from './modules/restaurants/restaurant.controller';

import { AuthRepository } from './modules/auth/auth.repository';
import { AuthContextService } from './modules/auth/auth-context.service';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';

import { CategoryRepository } from './modules/categories/category.repository';
import { CategoryService } from './modules/categories/category.service';
import { CategoryController } from './modules/categories/category.controller';

import { ProductRepository } from './modules/products/product.repository';
import { ProductService } from './modules/products/product.service';
import { ProductController } from './modules/products/product.controller';

import { ProductPriceRepository } from './modules/pricing/price.repository';
import { PricingService } from './modules/pricing/price.service';
import { PricingController } from './modules/pricing/price.controller';

import { OfferRepository } from './modules/vendor-offers/offer.repository';
import { OfferService } from './modules/vendor-offers/offer.service';
import { OfferController } from './modules/vendor-offers/offer.controller';

import { CartItemRepository, CartRepository } from './modules/cart/cart.repository';
import { CartService } from './modules/cart/cart.service';
import { CartController } from './modules/cart/cart.controller';

import { OrderRepository } from './modules/orders/order.repository';
import { OutboxRepository } from './modules/orders/outbox.repository';
import { OrderService } from './modules/orders/order.service';
import { OrderController } from './modules/orders/order.controller';

import { PaymentRepository } from './modules/payments/payment.repository';
import { PaymentService } from './modules/payments/payment.service';
import { PaymentController } from './modules/payments/payment.controller';

import { PerformanceRepository } from './modules/vendor-performance/performance.repository';
import { PerformanceService } from './modules/vendor-performance/performance.service';
import { PerformanceController } from './modules/vendor-performance/performance.controller';

import { CallRepository } from './modules/vendor-calls/call.repository';
import { CallService } from './modules/vendor-calls/call.service';
import { CallController } from './modules/vendor-calls/call.controller';

import { AnalyticsRepository } from './modules/analytics/analytics.repository';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { AnalyticsController } from './modules/analytics/analytics.controller';

import { SettingRepository } from './modules/settings/setting.repository';
import { NotificationRepository } from './modules/notifications/notification.repository';
import { NotificationService } from './modules/notifications/notification.service';
import { NotificationController } from './modules/notifications/notification.controller';

import { IdempotencyRepository } from './modules/idempotency/idempotency.repository';

export interface ContainerDeps {
  db: Database;
  env: Env;
  logger: FastifyBaseLogger;
  /** Wraps `@fastify/jwt` (available after the jwt plugin is registered). */
  signer: AccessTokenSigner;
}

export interface Controllers {
  auth: AuthController;
  users: UserController;
  organizations: OrganizationController;
  vendors: VendorController;
  restaurants: RestaurantController;
  categories: CategoryController;
  products: ProductController;
  pricing: PricingController;
  offers: OfferController;
  cart: CartController;
  orders: OrderController;
  payments: PaymentController;
  performance: PerformanceController;
  calls: CallController;
  analytics: AnalyticsController;
  notifications: NotificationController;
  audit: AuditController;
}

export interface Container {
  controllers: Controllers;
  /** Injected into the auth middleware to build the per-request context. */
  authContextLoader: AuthContextLoader;
  /** Injected into the idempotency middleware as its persistence backend. */
  idempotencyStore: IdempotencyStore;
}

/**
 * Composition root. The ONLY place that wires concrete implementations together
 * (RULES.md §3 — Dependency Inversion). Everything else depends on abstractions.
 */
export function buildContainer(deps: ContainerDeps): Container {
  const { db, env, logger, signer } = deps;

  // --- Repositories --------------------------------------------------------
  const auditRepository = new AuditRepository(db);
  const userRepository = new UserRepository(db);
  const roleRepository = new RoleRepository(db);
  const organizationRepository = new OrganizationRepository(db);
  const memberRepository = new OrganizationMemberRepository(db);
  const addressRepository = new OrganizationAddressRepository(db);
  const vendorRepository = new VendorRepository(db);
  const restaurantRepository = new RestaurantRepository(db);
  const authRepository = new AuthRepository(db);
  const categoryRepository = new CategoryRepository(db);
  const productRepository = new ProductRepository(db);
  const priceRepository = new ProductPriceRepository(db);
  const offerRepository = new OfferRepository(db);
  const cartRepository = new CartRepository(db);
  const cartItemRepository = new CartItemRepository(db);
  const orderRepository = new OrderRepository(db);
  const outboxRepository = new OutboxRepository(db);
  const paymentRepository = new PaymentRepository(db);
  const performanceRepository = new PerformanceRepository(db);
  const callRepository = new CallRepository(db);
  const analyticsRepository = new AnalyticsRepository(db);
  const settingRepository = new SettingRepository(db);
  const notificationRepository = new NotificationRepository(db);
  const idempotencyRepository = new IdempotencyRepository(db);

  // --- Shared utilities ----------------------------------------------------
  const hasher = new BcryptPasswordHasher(env.BCRYPT_SALT_ROUNDS);

  // --- Services ------------------------------------------------------------
  const auditService = new AuditService(auditRepository, logger);
  const authContextService = new AuthContextService(userRepository);
  const authService = new AuthService(
    db,
    env,
    userRepository,
    roleRepository,
    organizationRepository,
    memberRepository,
    vendorRepository,
    restaurantRepository,
    authRepository,
    authContextService,
    hasher,
    signer,
    logger,
  );
  const userService = new UserService(
    db,
    userRepository,
    roleRepository,
    hasher,
    auditService,
    logger,
    authContextService,
  );
  const organizationService = new OrganizationService(
    organizationRepository,
    memberRepository,
    addressRepository,
    userRepository,
    auditService,
    authContextService,
  );
  const vendorService = new VendorService(
    db,
    vendorRepository,
    userRepository,
    roleRepository,
    organizationRepository,
    memberRepository,
    hasher,
    auditService,
    logger,
  );
  const restaurantService = new RestaurantService(restaurantRepository);
  const categoryService = new CategoryService(categoryRepository);
  const productService = new ProductService(
    db,
    productRepository,
    categoryRepository,
    auditService,
    logger,
  );
  const pricingService = new PricingService(
    db,
    priceRepository,
    productRepository,
    offerRepository,
    auditService,
  );
  const offerService = new OfferService(db, offerRepository, productRepository, auditService);
  const cartService = new CartService(
    db,
    cartRepository,
    cartItemRepository,
    productRepository,
    priceRepository,
  );
  const orderService = new OrderService(
    db,
    orderRepository,
    cartRepository,
    offerRepository,
    performanceRepository,
    vendorRepository,
    outboxRepository,
    settingRepository,
    auditService,
    logger,
  );
  const paymentService = new PaymentService(
    db,
    paymentRepository,
    orderRepository,
    orderService,
    auditService,
    logger,
  );
  const performanceService = new PerformanceService(
    performanceRepository,
    vendorRepository,
    auditService,
  );
  const callService = new CallService(
    db,
    callRepository,
    orderRepository,
    vendorRepository,
    performanceRepository,
    auditService,
  );
  const analyticsService = new AnalyticsService(analyticsRepository);
  const notificationService = new NotificationService(notificationRepository);

  // --- Controllers ---------------------------------------------------------
  const controllers: Controllers = {
    auth: new AuthController(authService, env),
    users: new UserController(userService),
    organizations: new OrganizationController(organizationService),
    vendors: new VendorController(vendorService),
    restaurants: new RestaurantController(restaurantService),
    categories: new CategoryController(categoryService),
    products: new ProductController(productService),
    pricing: new PricingController(pricingService),
    offers: new OfferController(offerService),
    cart: new CartController(cartService),
    orders: new OrderController(orderService),
    payments: new PaymentController(paymentService),
    performance: new PerformanceController(performanceService),
    calls: new CallController(callService),
    analytics: new AnalyticsController(analyticsService),
    notifications: new NotificationController(notificationService),
    audit: new AuditController(auditService),
  };

  return {
    controllers,
    authContextLoader: authContextService,
    idempotencyStore: idempotencyRepository,
  };
}
