import type { Money, PriceBreakdown, PricingInput, PricingLine } from "../types";

const clp = (amount: number): Money => ({ amount: Math.round(amount), currency: "CLP" });

function sumLines(lines: readonly PricingLine[] = []): number {
  return lines.reduce((total, line) => total + line.unitPrice.amount * line.quantity, 0);
}

export function calculatePrice(input: PricingInput): PriceBreakdown {
  const extrasAmount = sumLines(input.extras);
  const transportAmount = input.transport?.amount ?? 0;
  const brandingAmount = input.branding?.amount ?? 0;
  const qrAmount = input.qr?.amount ?? 0;
  const discountAmount = input.discount?.amount ?? 0;
  const grossBeforeVat = Math.max(0, input.basePrice.amount + extrasAmount + transportAmount + brandingAmount + qrAmount - discountAmount);
  const appliesVat = input.vatDecision.applyVat;
  const vatIncluded = !appliesVat && (input.vatDecision.mode === "INCLUDED" || input.vatDecision.mode === "CONDITIONAL");
  const ivaAmount = appliesVat
    ? grossBeforeVat * input.vatDecision.rate
    : vatIncluded
      ? grossBeforeVat - grossBeforeVat / (1 + input.vatDecision.rate)
      : 0;
  const finalAmount = appliesVat ? grossBeforeVat + ivaAmount : grossBeforeVat;
  const margin = input.estimatedCost
    ? { status: "DEFINED" as const, value: clp(grossBeforeVat - input.estimatedCost.amount) }
    : { status: "REQUIRES_QUOTE" as const, value: null };

  return {
    basePrice: clp(input.basePrice.amount),
    extras: clp(extrasAmount),
    transport: clp(transportAmount),
    branding: clp(brandingAmount),
    qr: clp(qrAmount),
    discount: clp(discountAmount),
    netBeforeVat: clp(grossBeforeVat),
    iva: clp(ivaAmount),
    finalTotal: clp(finalAmount),
    estimatedMargin: margin,
  };
}
