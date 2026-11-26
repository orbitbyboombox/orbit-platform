import { calculateDiscount } from "../commercial-hub/quote-calculation";

export type TributaryDiscount = { type: "PERCENT" | "CLP"; value: number };
export type TributaryLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  exempt: boolean;
  discount?: TributaryDiscount;
};

export function calculateTributaryDraft(lines: readonly TributaryLine[], globalDiscount?: TributaryDiscount) {
  const calculated = lines.map((line) => {
    if (!line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0
      || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error("Cada línea requiere descripción, cantidad positiva y precio válido.");
    }
    const gross = Math.round(line.quantity * line.unitPrice);
    if (!Number.isSafeInteger(gross)) throw new Error("Importe fuera de rango.");
    const discount = Math.round(calculateDiscount(gross, line.discount?.type ?? null, line.discount?.value ?? 0));
    return { ...line, lineTotal: gross - discount, discountAmount: discount };
  });
  const taxableSubtotal = calculated.reduce((sum, line) => sum + (line.exempt ? 0 : line.lineTotal), 0);
  const exemptSubtotal = calculated.reduce((sum, line) => sum + (line.exempt ? line.lineTotal : 0), 0);
  const subtotal = taxableSubtotal + exemptSubtotal;
  if (!Number.isSafeInteger(subtotal)) throw new Error("Subtotal fuera de rango.");
  const discount = Math.round(calculateDiscount(subtotal, globalDiscount?.type ?? null, globalDiscount?.value ?? 0));
  const taxableDiscount = subtotal ? Math.round(discount * (taxableSubtotal / subtotal)) : 0;
  const net = taxableSubtotal - taxableDiscount;
  const exempt = exemptSubtotal - (discount - taxableDiscount);
  const vat = Math.round(net * 0.19);
  const total = net + exempt + vat;
  if (!Number.isSafeInteger(total)) throw new Error("Total fuera de rango.");
  return { lines: calculated, totals: { net, exempt, vat, total, discount } };
}
