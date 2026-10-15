export const CHILEAN_VAT_RATE = 0.19;

export function roundClp(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

export function calculateInvoiceTotals(net: number, exempt = 0) {
  const normalizedNet = roundClp(Math.max(0, net));
  const normalizedExempt = roundClp(Math.max(0, exempt));
  const vat = roundClp(normalizedNet * CHILEAN_VAT_RATE);
  return { net: normalizedNet, vat, exempt: normalizedExempt, total: normalizedNet + vat + normalizedExempt };
}
