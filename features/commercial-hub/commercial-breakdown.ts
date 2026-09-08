export type CommercialBreakdownItem = {
  itemType?: unknown;
  total?: unknown;
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Derives the PDF presentation from the immutable commercial snapshot and item totals. */
export function resolveCommercialBreakdown(input: {
  snapshot: Record<string, unknown>;
  items: readonly CommercialBreakdownItem[];
}) {
  const source = input.snapshot;
  const nestedCommercial = source.commercial;
  const snapshot = nestedCommercial && typeof nestedCommercial === "object" && !Array.isArray(nestedCommercial)
    ? { ...source, ...(nestedCommercial as Record<string, unknown>) }
    : source;
  const negotiation = snapshot.commercialNegotiation && typeof snapshot.commercialNegotiation === "object" && !Array.isArray(snapshot.commercialNegotiation)
    ? snapshot.commercialNegotiation as Record<string, unknown>
    : {};
  const typedItems = input.items.filter((item) => typeof item.itemType === "string");
  const serviceSubtotal = typedItems
    .filter((item) => String(item.itemType).toUpperCase() === "SERVICE")
    .reduce((sum, item) => sum + amount(item.total), 0);
  const extras = typedItems
    .filter((item) => String(item.itemType).toUpperCase() === "EXTRA")
    .reduce((sum, item) => sum + amount(item.total), 0);
  const itemTransport = typedItems
    .filter((item) => String(item.itemType).toUpperCase() === "TRANSPORT")
    .reduce((sum, item) => sum + amount(item.total), 0);
  const transport = amount(snapshot.transportTotal ?? snapshot.transport ?? snapshot.appliedTransport) || itemTransport;
  const discount = amount(snapshot.discount ?? snapshot.discountTotal);
  const hasTypedLines = typedItems.length > 0;
  const explicitService = amount(
    snapshot.serviceSubtotal ?? snapshot.servicePrice ?? snapshot.negotiatedServicePrice ?? negotiation.negotiatedServicePrice,
  );
  const explicitExtras = amount(
    snapshot.extrasTotal ?? snapshot.negotiatedExtras ?? snapshot.extras ?? negotiation.negotiatedExtras,
  );
  const resolvedService = explicitService || serviceSubtotal;
  const resolvedExtras = explicitExtras || extras;
  const subtotal = hasTypedLines || explicitService || explicitExtras
    ? resolvedService + resolvedExtras
    : amount(snapshot.subtotal);
  const net = hasTypedLines
    ? Math.max(0, subtotal + transport - discount)
    : amount(snapshot.net);
  const taxSource = snapshot.tax ?? snapshot.taxTotal;
  const tax = taxSource === undefined || taxSource === null
    ? Math.round(net * 0.19)
    : amount(taxSource);
  const totalSource = snapshot.total ?? snapshot.grandTotal;
  const total = totalSource === undefined || totalSource === null
    ? net + tax
    : amount(totalSource);
  const depositPercent = amount(snapshot.depositPercent) || 50;
  const deposit = snapshot.deposit === undefined || snapshot.deposit === null
    ? Math.round((total * depositPercent) / 100)
    : amount(snapshot.deposit);
  return {
    serviceSubtotal: resolvedService || subtotal,
    extras: resolvedExtras,
    transport,
    subtotal,
    discount,
    net,
    tax,
    total,
    deposit,
    balance: snapshot.balance === undefined || snapshot.balance === null
      ? Math.max(0, total - deposit)
      : amount(snapshot.balance),
    depositPercent,
  };
}
