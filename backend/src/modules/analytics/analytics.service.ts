import { isAdmin, isPrivileged } from '../../common/authz';
import { ForbiddenError } from '../../common/errors';
import type { RequestContext } from '../../common/types';
import type { AnalyticsRepository } from './analytics.repository';
import type { DashboardMetric, DashboardResponse } from './analytics.schemas';

/** Orders that are placed and moving through fulfilment (not finished/dead). */
const IN_PROGRESS_STATUSES = [
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

/** Anything still "open" from the buyer's perspective (placed, not yet closed). */
const ACTIVE_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_RECEIVED',
  'PENDING_ADMIN_REVIEW',
  ...IN_PROGRESS_STATUSES,
] as const;

/** Closed/dead states excluded from "total"/"spend" style aggregates. */
const CLOSED_OR_DEAD = ['DRAFT', 'CANCELLED', 'REJECTED'] as const;

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Builds a role-appropriate dashboard from cheap aggregate counts/sums
 * (project-working.md → per-portal dashboards). Each portal gets a distinct set
 * of metrics; the frontend renders them generically using the `format` hint.
 */
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async getDashboard(ctx: RequestContext): Promise<DashboardResponse> {
    // Admin is the highest authority → platform analytics. Operations
    // ("Administration") gets the operational work queue. They are distinct
    // portals and must not share a dashboard.
    if (isAdmin(ctx)) {
      return this.adminDashboard();
    }
    if (isPrivileged(ctx)) {
      return this.operationsDashboard();
    }
    if (ctx.vendorId) {
      return this.vendorDashboard(ctx.vendorId);
    }
    if (ctx.restaurantId) {
      return this.restaurantDashboard(ctx.restaurantId);
    }
    throw new ForbiddenError('No dashboard is available for this account');
  }

  /** ADMIN PORTAL → Platform Analytics (totals, revenue, catalog footprint). */
  private async adminDashboard(): Promise<DashboardResponse> {
    const monthStart = startOfMonth();
    const [
      ordersByStatus,
      totalOrders,
      completedOrders,
      totalRevenue,
      monthRevenue,
      activeVendors,
      totalRestaurants,
      approvedProducts,
    ] = await Promise.all([
      this.analytics.ordersByStatus({}),
      this.analytics.countOrders({ status: { notIn: [...CLOSED_OR_DEAD] } }),
      this.analytics.countOrders({ status: 'COMPLETED' }),
      this.analytics.sumOrderTotal({ status: 'COMPLETED' }),
      this.analytics.sumOrderTotal({ status: 'COMPLETED', completedAt: { gte: monthStart } }),
      this.analytics.countVendors({ status: 'ACTIVE' }),
      this.analytics.countRestaurants({}),
      this.analytics.countProducts({ status: 'APPROVED' }),
    ]);

    const avgOrderValue = completedOrders > 0 ? money(totalRevenue / completedOrders) : 0;

    const metrics: DashboardMetric[] = [
      { key: 'totalOrders', label: 'Total orders', value: totalOrders, format: 'number' },
      { key: 'totalRevenue', label: 'Total revenue', value: money(totalRevenue), format: 'currency', hint: 'Completed orders' },
      { key: 'monthRevenue', label: 'Revenue this month', value: monthRevenue, format: 'currency' },
      { key: 'avgOrderValue', label: 'Avg order value', value: avgOrderValue, format: 'currency' },
      { key: 'completedOrders', label: 'Completed orders', value: completedOrders, format: 'number' },
      { key: 'activeVendors', label: 'Active vendors', value: activeVendors, format: 'number' },
      { key: 'totalRestaurants', label: 'Restaurants', value: totalRestaurants, format: 'number' },
      { key: 'approvedProducts', label: 'Catalog products', value: approvedProducts, format: 'number', hint: 'Approved' },
    ];

    return { scope: 'admin', generatedAt: new Date().toISOString(), metrics, ordersByStatus };
  }

  /** ADMINISTRATION (OPERATIONS) PORTAL → daily operational work queue. */
  private async operationsDashboard(): Promise<DashboardResponse> {
    const monthStart = startOfMonth();
    const todayStart = startOfToday();
    const [
      ordersByStatus,
      todaysOrders,
      awaitingReview,
      paymentsToVerify,
      awaitingVendor,
      inProgress,
      completed,
      rejected,
      monthRevenue,
      activeVendors,
    ] = await Promise.all([
      this.analytics.ordersByStatus({}),
      this.analytics.countOrders({ createdAt: { gte: todayStart } }),
      this.analytics.countOrders({ status: 'PENDING_ADMIN_REVIEW' }),
      this.analytics.countPayments({ status: 'SUBMITTED' }),
      this.analytics.countOrders({ status: 'VENDOR_ASSIGNED' }),
      this.analytics.countOrdersInStatuses(
        ['VENDOR_ACCEPTED', 'PROCESSING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
        {},
      ),
      this.analytics.countOrders({ status: 'COMPLETED' }),
      this.analytics.countOrders({ status: 'REJECTED' }),
      this.analytics.sumOrderTotal({ status: 'COMPLETED', completedAt: { gte: monthStart } }),
      this.analytics.countVendors({ status: 'ACTIVE' }),
    ]);

    const metrics: DashboardMetric[] = [
      { key: 'todaysOrders', label: "Today's orders", value: todaysOrders, format: 'number' },
      { key: 'awaitingReview', label: 'Awaiting review', value: awaitingReview, format: 'number', hint: 'Approve & assign' },
      { key: 'paymentsToVerify', label: 'Payments to verify', value: paymentsToVerify, format: 'number' },
      { key: 'awaitingVendor', label: 'Awaiting vendor', value: awaitingVendor, format: 'number', hint: 'Assigned, not accepted' },
      { key: 'inProgress', label: 'In progress', value: inProgress, format: 'number' },
      { key: 'completed', label: 'Completed', value: completed, format: 'number' },
      { key: 'rejected', label: 'Rejected', value: rejected, format: 'number' },
      { key: 'monthRevenue', label: 'Revenue this month', value: monthRevenue, format: 'currency' },
      { key: 'activeVendors', label: 'Active vendors', value: activeVendors, format: 'number' },
    ];

    return { scope: 'operations', generatedAt: new Date().toISOString(), metrics, ordersByStatus };
  }

  /** VENDOR PORTAL → assignments, performance scorecard, revenue. */
  private async vendorDashboard(vendorId: string): Promise<DashboardResponse> {
    const where = { assignedVendorId: vendorId };
    const [ordersByStatus, performance, revenue, activeOffers] = await Promise.all([
      this.analytics.ordersByStatus(where),
      this.analytics.vendorPerformance(vendorId),
      this.analytics.sumOrderTotal({ ...where, status: 'COMPLETED' }),
      this.analytics.countOffers({ vendorId, status: 'APPROVED' }),
    ]);

    const totalAssigned = performance?.totalAssigned ?? 0;
    const totalAccepted = performance?.totalAccepted ?? 0;
    const totalRejected = performance?.totalRejected ?? 0;
    const totalCompleted = performance?.totalCompleted ?? 0;
    const ratingCount = performance?.ratingCount ?? 0;
    const ratingSum = performance?.ratingSum ?? 0;

    const acceptanceRate = rate(totalAccepted, totalAssigned);
    const successRate = rate(totalCompleted, totalAssigned);
    // Composite headline score: weights successful fulfilment over acceptance.
    const performanceScore = Math.round(successRate * 0.6 + acceptanceRate * 0.4);
    const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

    const metrics: DashboardMetric[] = [
      { key: 'assigned', label: 'Assigned orders', value: totalAssigned, format: 'number' },
      { key: 'accepted', label: 'Accepted', value: totalAccepted, format: 'number' },
      { key: 'rejected', label: 'Rejected', value: totalRejected, format: 'number' },
      { key: 'completed', label: 'Completed', value: totalCompleted, format: 'number' },
      { key: 'performanceScore', label: 'Performance score', value: performanceScore, format: 'percent' },
      { key: 'successRate', label: 'Success rate', value: successRate, format: 'percent', hint: 'Completed / assigned' },
      { key: 'averageRating', label: 'Avg rating', value: averageRating, format: 'rating' },
      { key: 'revenue', label: 'Total revenue', value: money(revenue), format: 'currency', hint: 'Completed orders' },
      { key: 'activeOffers', label: 'Active offers', value: activeOffers, format: 'number' },
    ];

    return { scope: 'vendor', generatedAt: new Date().toISOString(), metrics, ordersByStatus };
  }

  /** RESTAURANT PORTAL → orders, spend, fulfilment progress. */
  private async restaurantDashboard(restaurantId: string): Promise<DashboardResponse> {
    const where = { restaurantId };
    const monthStart = startOfMonth();
    const [ordersByStatus, totalOrders, pending, completed, monthSpend, totalSpend] =
      await Promise.all([
        this.analytics.ordersByStatus(where),
        this.analytics.countOrders({ ...where, status: { notIn: ['DRAFT'] } }),
        this.analytics.countOrdersInStatuses([...ACTIVE_STATUSES], where),
        this.analytics.countOrders({ ...where, status: 'COMPLETED' }),
        this.analytics.sumOrderTotal({
          ...where,
          status: { notIn: [...CLOSED_OR_DEAD] },
          createdAt: { gte: monthStart },
        }),
        this.analytics.sumOrderTotal({ ...where, status: { notIn: [...CLOSED_OR_DEAD] } }),
      ]);

    const metrics: DashboardMetric[] = [
      { key: 'totalOrders', label: 'Total orders', value: totalOrders, format: 'number' },
      { key: 'pending', label: 'Pending orders', value: pending, format: 'number', hint: 'In progress' },
      { key: 'completed', label: 'Completed orders', value: completed, format: 'number' },
      { key: 'monthSpend', label: 'Monthly spending', value: monthSpend, format: 'currency' },
      { key: 'totalSpend', label: 'Total spending', value: money(totalSpend), format: 'currency' },
    ];

    return { scope: 'restaurant', generatedAt: new Date().toISOString(), metrics, ordersByStatus };
  }
}
