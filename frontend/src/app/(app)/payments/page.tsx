'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { usePayments, useRejectPayment, useVerifyPayment } from '@/hooks/use-payments';
import { ApiError } from '@/lib/api';
import { formatDate, formatMoney, titleCase } from '@/lib/format';

const STATUSES = ['SUBMITTED', 'VERIFIED', 'REJECTED', 'PENDING', 'SUCCESS', 'FAILED'];
const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const [status, setStatus] = useState('SUBMITTED');
  const [page, setPage] = useState(1);
  const verify = useVerifyPayment();
  const reject = useRejectPayment();

  const { data, isLoading, isError, error } = usePayments({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
  });

  const payments = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment verification</h1>
          <p className="text-sm text-gray-500">Review advance-payment proofs from restaurants</p>
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading payments…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load payments'}
        </p>
      )}

      {data && payments.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Nothing to review here.
        </p>
      )}

      {payments.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Proof</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.orderNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{titleCase(p.paymentType)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-3 text-gray-500">{p.transactionReference ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.proofUrl ? (
                        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'SUBMITTED' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => verify.mutate(p.id)} disabled={verify.isPending}>
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => reject.mutate({ id: p.id, reason: 'Proof not valid' })}
                            disabled={reject.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
    </div>
  );
}
