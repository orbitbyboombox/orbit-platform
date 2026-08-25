import type { FormalQuoteDraft } from "./types.ts";
import { calculateFormalQuote } from "./quote-calculation.ts";

export function prepareFormalQuotePersistence(input: FormalQuoteDraft) {
  const calculation = calculateFormalQuote(
    input.lines,
    input.globalDiscountType,
    input.globalDiscountValue,
    input.depositPercent,
  );
  const normalizedLines = input.lines.map((line, index) => ({
    ...line,
    order: index,
    total: calculation.lineTotals[index],
  }));
  const customerSnapshot = {
    company: input.company,
    rut: input.rut,
    contact: input.contact,
    email: input.email,
    secondaryEmail: input.secondaryEmail ?? "",
    phone: input.phone,
    address: input.address,
  };
  const commercialSnapshot = {
    customer: customerSnapshot,
    event: {
      name: input.eventName,
      date: input.eventDate,
      time: input.eventTime,
      location: input.eventLocation,
      city: input.eventCity,
    },
    lines: normalizedLines,
    subtotal: calculation.subtotal,
    discount: calculation.discount,
    net: calculation.net,
    tax: calculation.vat,
    total: calculation.total,
    depositPercent: input.depositPercent,
    deposit: calculation.deposit,
    balance: calculation.balance,
    validityDays: input.validityDays,
  };
  const items = normalizedLines.map((line) => ({
    itemType: line.manual
      ? "EXTRA"
      : line.code.includes("TRANSPORT")
        ? "TRANSPORT"
        : "SERVICE",
    code: line.code,
    description: line.description,
    quantity: line.quantity,
    quotedPrice: line.quotedPrice,
    total: line.total,
    catalogPrice: line.catalogPrice,
    discountType: line.discountType,
    discountValue: line.discountValue,
    displayOrder: line.order,
    manual: line.manual,
    metadata: {
      catalogOverride:
        line.catalogPrice != null && line.catalogPrice !== line.quotedPrice,
    },
  }));

  return { calculation, customerSnapshot, commercialSnapshot, items };
}
