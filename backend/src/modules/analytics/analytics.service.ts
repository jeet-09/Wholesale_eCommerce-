import { isPrivileged } from '../../common/authz';
import { ForbiddenError } from '../../common/errors';
import type { RequestContext } from '../../common/types';
import type { AnalyticsRepository } from './analytics.repository';
import type { DashboardResponse } from './analytics.schemas';

const IN_PROGRESS_STATUSES = [
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'DELIVERED',
] as const;

/**
 * Builds a role-appropriate dashboard from cheap aggregate counts
 * (project-working.md PORTAL FEATURES → dashboards). The shape is identical
 * across roles (metrics + ordersByStatus) so the frontend renders generically.
 */
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async getDashboard(ctx: RequestContext): Promise<DashboardResponse> {
    if (isPrivileged(ctx)) {
      return this.adminDashboard();
    }
    if (ctx.vendorId) {
      return this.vendorDashboard(ctx.vendorId);
    }
    if (ctx.restaurantId) {
      return this.restaurantDashboard(ctx.restaurantId);
    }
    throw new ForbiddenError('No dashboard is available for this account');
  }

  private async adminDashboard(): Promise<DashboardResponse> {
    const [
      ordersByStatus,
      pendingPaymentVerification,
      pendingReview,
      productsUnderReview,
      offersPending,
      activeVendors,
      totalRestaurants,
    ] = await Promise.all([
      this.analytics.ordersByStatus({}),
      this.analytics.countPayments({ status: 'SUBMITTED' }),
      this.analytics.countOrders({ status: 'PENDING_ADMIN_REVIEW' }),
      this.analytics.countProducts({ status: 'UNDER_REVIEW' }),
      this.analytics.countOffers({ status: 'PENDING' }),
      this.analytics.countVendors({ status: 'ACTIVE' }),
      this.analytics.countRestaurants({}),
    ]);

    return {
      scope: 'admin',
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'pendingPaymentVerification', label: 'Payments to verify', value: pendingPaymentVerification },
        { key: 'pendingReview', label: 'Orders awaiting review', value: pendingReview },
        { key: 'productsUnderReview', label: 'Products under review', value: productsUnderReview },
        { key: 'offersPending', label: 'Offers pending', value: offersPending },
        { key: 'activeVendors', label: 'Active vendors', value: activeVendors },
        { key: 'totalRestaurants', label: 'Restaurants', value: totalRestaurants },
      ],
      ordersByStatus,
    };
  }

  private async vendorDashboard(vendorId: string): Promise<DashboardResponse> {
    const where = { assignedVendorId: vendorId };
    const [ordersByStatus, awaitingResponse, inProgress, completed, activeOffers] =
      await Promise.all([
        this.analytics.ordersByStatus(where),
        this.analytics.countOrders({ ...where, status: 'VENDOR_ASSIGNED' }),
        this.analytics.countOrdersInStatuses([...IN_PROGRESS_STATUSES], where),
        this.analytics.countOrders({ ...where, status: 'COMPLETED' }),
        this.analytics.countOffers({ vendorId, status: 'APPROVED' }),
      ]);

    return {
      scope: 'vendor',
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'awaitingResponse', label: 'Awaiting your response', value: awaitingResponse },
        { key: 'inProgress', label: 'In progress', value: inProgress },
        { key: 'completed', label: 'Completed', value: completed },
        { key: 'activeOffers', label: 'Active offers', value: activeOffers },
      ],
      ordersByStatus,
    };
  }

  private async restaurantDashboard(restaurantId: string): Promise<DashboardResponse> {
    const where = { restaurantId };
    const [ordersByStatus, pendingPayment, inProgress, completed] = await Promise.all([
      this.analytics.ordersByStatus(where),
      this.analytics.countOrders({ ...where, status: 'PENDING_PAYMENT' }),
      this.analytics.countOrdersInStatuses([...IN_PROGRESS_STATUSES], where),
      this.analytics.countOrders({ ...where, status: 'COMPLETED' }),
    ]);

    return {
      scope: 'restaurant',
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'pendingPayment', label: 'Awaiting payment', value: pendingPayment },
        { key: 'inProgress', label: 'In progress', value: inProgress },
        { key: 'completed', label: 'Completed', value: completed },
      ],
      ordersByStatus,
    };
  }
}
