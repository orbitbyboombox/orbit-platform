import type { DiscountType, QuoteLineDraft } from "./types";

const bounded = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));

export function calculateDiscount(
  gross: number,
  type: DiscountType | null,
  value: number,
) {
  if (type === "PERCENT") return Math.round(gross * bounded(value, 0, 100) / 100);
  if (type === "CLP") return Math.min(gross, bounded(value, 0, gross));
  return 0;
}

export function calculateFormalQuote(
  lines: readonly QuoteLineDraft[],
  globalDiscountType: DiscountType | null,
  globalDiscountValue: number,
  depositPercent: number,
) {
  const lineGrossTotals = lines.map(
    (line) => Math.max(0, line.quotedPrice) * Math.max(1, line.quantity),
  );
  const lineDiscounts = lines.map((line, index) =>
    calculateDiscount(lineGrossTotals[index], line.discountType, line.discountValue),
  );
  const lineTotals = lineGrossTotals.map((gross, index) =>
    Math.max(0, gross - lineDiscounts[index]),
  );
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  const discount = calculateDiscount(
    subtotal,
    globalDiscountType,
    globalDiscountValue,
  );
  const net = Math.max(0, subtotal - discount);
  const vat = Math.round(net * 0.19);
  const total = net + vat;
  const deposit = Math.round(total * bounded(depositPercent, 0, 100) / 100);
  return {
    lineGrossTotals,
    lineDiscounts,
    lineTotals,
    subtotal,
    discount,
    net,
    vat,
    total,
    deposit,
    balance: total - deposit,
  };
}

export const isCommercialEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
