import { z } from 'zod';

export const dashboardMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
});

export const dashboardStatusCountSchema = z.object({
  status: z.string(),
  count: z.number(),
});

export const dashboardResponseSchema = z.object({
  scope: z.enum(['admin', 'vendor', 'restaurant']),
  generatedAt: z.string(),
  metrics: z.array(dashboardMetricSchema),
  ordersByStatus: z.array(dashboardStatusCountSchema),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
