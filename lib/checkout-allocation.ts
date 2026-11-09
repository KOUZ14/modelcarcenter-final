// Largest-remainder allocation keeps every cent accounted for and is stable
// across retries when callers supply rows in a consistent order.
export function allocateCents(amount: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0 || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) throw new Error("Invalid payment allocation.");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) {
    if (amount) throw new Error("Cannot allocate payment without an order total.");
    return weights.map(() => 0);
  }
  const shares = weights.map((weight, index) => {
    const product = BigInt(amount) * BigInt(weight);
    return { index, amount: Number(product / BigInt(total)), remainder: product % BigInt(total) };
  });
  let left = amount - shares.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (left-- > 0) share.amount += 1;
  }
  return shares.map((share) => share.amount);
}

export type CheckoutLine = {
  quantity: number;
  amount_total: number;
  amount_tax: number;
  price: { unit_amount: number; product: string | { metadata?: Record<string, string> | null } };
};

export function allocateCheckoutLines(
  reservations: Array<{ id: string; subtotalCents: number; shippingCents: number }>,
  lines: CheckoutLine[], totalCents: number, taxCents: number, processingFeeCents: number | null,
) {
  const totals = new Map(reservations.map((row) => [row.id, { base: 0, totalCents: 0, taxCents: 0 }]));
  for (const line of lines) {
    const id = typeof line.price.product === "object" ? line.price.product.metadata?.reservation_id : undefined;
    const entry = id ? totals.get(id) : null;
    if (!entry || !Number.isInteger(line.quantity) || line.quantity < 1 ||
        [line.amount_total, line.amount_tax, line.price.unit_amount].some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
      throw new Error("Checkout line cannot be matched to a reserved seller order.");
    }
    entry.base += line.price.unit_amount * line.quantity;
    entry.totalCents += line.amount_total;
    entry.taxCents += line.amount_tax;
  }
  const rows = reservations.map((reservation) => {
    const amounts = totals.get(reservation.id)!;
    if (amounts.base !== reservation.subtotalCents + reservation.shippingCents) throw new Error("Paid items do not match the reserved seller order.");
    return { reservationId: reservation.id, totalCents: amounts.totalCents, taxCents: amounts.taxCents };
  });
  if (rows.reduce((sum, row) => sum + row.totalCents, 0) !== totalCents || rows.reduce((sum, row) => sum + row.taxCents, 0) !== taxCents) throw new Error("Seller allocations do not match the paid checkout.");
  const fees = processingFeeCents === null ? rows.map(() => null) : allocateCents(processingFeeCents, rows.map((row) => row.totalCents));
  return rows.map((row, index) => ({ ...row, processingFeeCents: fees[index] }));
}
