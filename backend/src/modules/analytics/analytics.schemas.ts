import { z } from 'zod';

/** How the frontend should render a metric value. */
export const metricFormatSchema = z.enum(['number', 'currency', 'percent', 'rating']);

export const dashboardMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  // Nullable so we can express "no data yet" (e.g. average rating) instead of a
  // misleading zero.
  value: z.number().nullable(),
  format: metricFormatSchema.default('number'),
  /** Optional short context line shown under the value. */
  hint: z.string().optional(),
});

export const dashboardStatusCountSchema = z.object({
  status: z.string(),
  count: z.number(),
});

export const dashboardResponseSchema = z.object({
  scope: z.enum(['admin', 'operations', 'vendor', 'restaurant']),
  generatedAt: z.string(),
  metrics: z.array(dashboardMetricSchema),
  ordersByStatus: z.array(dashboardStatusCountSchema),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardMetric = z.infer<typeof dashboardMetricSchema>;
