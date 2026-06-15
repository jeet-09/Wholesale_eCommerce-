'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useRateVendor, useVendorPerformanceList } from '@/hooks/use-performance';
import { ApiError } from '@/lib/api';
import { PERMISSIONS, useAuthz } from '@/lib/authz';
import type { VendorPerformance } from '@/lib/types';

type Feedback = { type: 'ok' | 'err'; message: string } | null;

function pct(value: number): string {
  return `${value}%`;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function RateModal({ vendor, onClose }: { vendor: VendorPerformance; onClose: () => void }) {
  const rate = useRateVendor();
  const [rating, setRating] = useState('5');
  const [remarks, setRemarks] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    rate.mutate(
      { vendorId: vendor.vendorId, rating: Number(rating), remarks: remarks.trim() || undefined },
      {
        onSuccess: () => onClose(),
        onError: (err) => setFeedback({ type: 'err', message: err instanceof ApiError ? err.message : 'Failed to rate' }),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardBody>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Rate {vendor.vendorName ?? 'vendor'}</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="rate-value">Rating</Label>
                <Select id="rate-value" value={rating} onChange={(e) => setRating(e.target.value)}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>
                      {r} / 5
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="rate-remarks">Remarks (optional)</Label>
                <Input id="rate-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              {feedback && <p className="text-sm text-red-600">{feedback.message}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={rate.isPending}>
                  {rate.isPending ? 'Saving…' : 'Submit rating'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const authz = useAuthz();
  const canRate = authz.can(PERMISSIONS.PERFORMANCE_RATE);
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<VendorPerformance | null>(null);
  const { data, isLoading, isError, error } = useVendorPerformanceList({ page, pageSize: 12, sort: '-successRate' });

  const vendors = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendor performance</h1>
        <p className="text-sm text-gray-500">Acceptance, completion and fulfilment scorecards</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading scorecards…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load performance'}
        </p>
      )}

      {data && vendors.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No vendor performance data yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {vendors.map((vendor) => (
          <Card key={vendor.vendorId}>
            <CardBody>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{vendor.vendorName ?? 'Vendor'}</h3>
                  <p className="text-xs text-gray-500">
                    {vendor.averageRating !== null ? `★ ${vendor.averageRating} avg rating` : 'Not yet rated'}
                  </p>
                </div>
                {canRate && (
                  <Button size="sm" variant="secondary" onClick={() => setRating(vendor)}>
                    Rate
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-2">
                <Metric label="Assigned" value={vendor.totalAssigned} />
                <Metric label="Accepted" value={vendor.totalAccepted} />
                <Metric label="Completed" value={vendor.totalCompleted} />
                <Metric label="Acceptance" value={pct(vendor.acceptanceRate)} />
                <Metric label="Completion" value={pct(vendor.completionRate)} />
                <Metric label="Success" value={pct(vendor.successRate)} />
                <Metric label="Rejected" value={vendor.totalRejected} />
                <Metric label="No response" value={vendor.totalNoResponse} />
                <Metric
                  label="Avg fulfil"
                  value={vendor.averageFulfilmentMinutes !== null ? `${vendor.averageFulfilmentMinutes}m` : '—'}
                />
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button variant="secondary" size="sm" disabled={!pagination.hasPreviousPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {rating && <RateModal vendor={rating} onClose={() => setRating(null)} />}
    </div>
  );
}
