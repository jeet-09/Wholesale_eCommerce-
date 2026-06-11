/**
 * Human-readable order number, e.g. `ORD-2026-000123` (DATABASE.md orders).
 * The numeric part comes from the `order_number_seq` Postgres sequence so it is
 * unique without contention; the year is informational.
 */
export function formatOrderNumber(sequenceValue: bigint | number, year: number): string {
  const padded = String(sequenceValue).padStart(6, '0');
  return `ORD-${year}-${padded}`;
}
