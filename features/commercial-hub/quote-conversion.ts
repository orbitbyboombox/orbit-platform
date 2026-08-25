export type AcceptedQuoteLine = {
  id: string;
  itemType: string;
  code: string;
  label: string;
  quantity: number;
  catalogPrice: number | null;
  quotedPrice: number;
  total: number;
  isManual: boolean;
};

export type QuoteConversionReview = {
  quoteId: string;
  number: string;
  version: number;
  status: string;
  projectId: string | null;
  customerId: string | null;
  acceptedAt: string;
  pdfAvailable: boolean;
  customer: {
    company: string;
    rut: string;
    contact: string;
    email: string;
    secondaryEmail: string;
    phone: string;
    address: string;
  };
  event: {
    name: string;
    date: string;
    time: string;
    location: string;
    city: string;
    durationHours: number | null;
  };
  items: AcceptedQuoteLine[];
  financial: {
    subtotal: number;
    discount: number;
    net: number;
    tax: number;
    total: number;
    depositPercent: number;
    deposit: number;
    balance: number;
    customerTransportCharge: number;
    paymentCondition: "FIFTY_FIFTY" | "CASH" | "CORPORATE_CREDIT" | null;
    paymentTermDays: number;
  };
  commercialConditions: string[];
  missing: string[];
};

export type QuoteConversionOverrides = Partial<
  QuoteConversionReview["event"]
> & {
  customerCompany?: string;
  customerRut?: string;
  customerContact?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  paymentCondition?: string;
  paymentTermDays?: number;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function buildQuoteConversionReview(input: {
  quoteId: string;
  status: string;
  projectId?: string | null;
  customerId?: string | null;
  snapshot: unknown;
}): QuoteConversionReview {
  const snapshot = record(input.snapshot);
  const quotation = record(snapshot.quotation);
  const customer = record(snapshot.customer);
  const commercial = record(snapshot.commercial);
  const event = record(commercial.event);
  const rawItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  const items = rawItems.map((value, index) => {
    const item = record(value);
    return {
      id: text(item.id) || `${input.quoteId}:${index}`,
      itemType: text(item.itemType) || "SERVICE",
      code: text(item.code) || `ITEM-${index + 1}`,
      label: text(item.label) || text(item.code) || `Ítem ${index + 1}`,
      quantity: Math.max(1, number(item.quantity, 1)),
      catalogPrice:
        item.catalogPrice === null || item.catalogPrice === undefined
          ? null
          : number(item.catalogPrice),
      quotedPrice: number(item.quotedPrice),
      total: number(item.total),
      isManual: Boolean(item.isManual),
    } satisfies AcceptedQuoteLine;
  });
  const subtotal = number(commercial.subtotal, number(quotation.subtotal));
  const discount = number(
    commercial.discount,
    number(quotation.discountTotal),
  );
  const net = number(commercial.net, Math.max(0, subtotal - discount));
  const tax = number(commercial.tax, number(quotation.taxTotal));
  const total = number(
    commercial.total,
    number(quotation.grandTotal, net + tax),
  );
  const depositPercent = number(
    commercial.depositPercent,
    number(quotation.depositPercent, 50),
  );
  const deposit = number(
    commercial.deposit,
    Math.round((total * depositPercent) / 100),
  );
  const lineTransportCharge = items
    .filter((item) => item.itemType === "TRANSPORT")
    .reduce((sum, item) => sum + item.total, 0);
  const customerTransportCharge =
    number(quotation.transportTotal) || lineTransportCharge;
  const durationHours = number(event.durationHours, 0) || null;
  const rawPaymentCondition = text(commercial.paymentCondition).toUpperCase();
  const paymentCondition = (rawPaymentCondition === "CORPORATE_CREDIT" || rawPaymentCondition === "CASH" || rawPaymentCondition === "FIFTY_FIFTY"
    ? rawPaymentCondition
    : null) as QuoteConversionReview["financial"]["paymentCondition"];
  const paymentTermDays = Math.max(0, Math.trunc(number(commercial.paymentTermDays, 0)));
  const review: QuoteConversionReview = {
    quoteId: input.quoteId,
    number: text(quotation.number),
    version: Math.max(1, number(quotation.version, 1)),
    status: input.status,
    projectId: input.projectId ?? null,
    customerId: input.customerId ?? null,
    acceptedAt: text(quotation.acceptedAt),
    pdfAvailable: Boolean(
      text(quotation.pdfStoragePath) || text(quotation.driveFileId),
    ),
    customer: {
      company: text(customer.company),
      rut: text(customer.rut),
      contact: text(customer.contact),
      email: text(customer.email),
      secondaryEmail: text(customer.secondaryEmail),
      phone: text(customer.phone),
      address: text(customer.address),
    },
    event: {
      name: text(event.name),
      date: text(event.date),
      time: text(event.time).slice(0, 5),
      location: text(event.location),
      city: text(event.city),
      durationHours,
    },
    items,
    financial: {
      subtotal,
      discount,
      net,
      tax,
      total,
      depositPercent,
      deposit,
      balance: number(commercial.balance, Math.max(0, total - deposit)),
      customerTransportCharge,
      paymentCondition,
      paymentTermDays,
    },
    commercialConditions: Array.isArray(commercial.conditions)
      ? commercial.conditions.map(text).filter(Boolean)
      : [],
    missing: [],
  };
  review.missing = missingQuoteConversionFields(review);
  return review;
}

export function missingQuoteConversionFields(review: QuoteConversionReview) {
  const missing: string[] = [];
  if (!review.customerId && !review.customer.contact && !review.customer.company)
    missing.push("Cliente o empresa");
  if (!review.customerId && !review.customer.email)
    missing.push("Email principal");
  if (!review.event.name) missing.push("Evento / proyecto");
  if (!review.event.date) missing.push("Fecha del evento");
  if (!review.event.time) missing.push("Hora de inicio");
  if (!review.event.location) missing.push("Lugar / dirección");
  if (!review.event.city) missing.push("Comuna / ciudad");
  if (!review.event.durationHours) missing.push("Duración");
  if (!review.items.length) missing.push("Servicios / productos");
  if (!review.financial.paymentCondition) missing.push("Condición de pago");
  if (review.financial.paymentCondition === "CORPORATE_CREDIT" && review.financial.paymentTermDays <= 0) missing.push("Plazo de crédito Empresa");
  return missing;
}

export function resolveQuoteConversionPaymentTerms(review: QuoteConversionReview, overrides: QuoteConversionOverrides) {
  const rawCondition = review.financial.paymentCondition || text(overrides.paymentCondition).toUpperCase();
  const paymentCondition = (rawCondition === "CORPORATE_CREDIT" || rawCondition === "CASH" || rawCondition === "FIFTY_FIFTY"
    ? rawCondition
    : null) as QuoteConversionReview["financial"]["paymentCondition"];
  const overrideDays = Math.max(0, Math.trunc(Number(overrides.paymentTermDays ?? 0)));
  const paymentTermDays = paymentCondition === "CORPORATE_CREDIT"
    ? review.financial.paymentTermDays || overrideDays
    : 0;
  if (!paymentCondition) throw new Error("Selecciona la condición de pago aceptada.");
  if (paymentCondition === "CORPORATE_CREDIT" && paymentTermDays <= 0)
    throw new Error("El crédito Empresa requiere un plazo positivo en días.");
  return { paymentCondition, paymentTermDays };
}

export function resolveQuoteConversionEvent(
  review: QuoteConversionReview,
  overrides: QuoteConversionOverrides,
) {
  const duration = Number(overrides.durationHours);
  return {
    name: review.event.name || text(overrides.name),
    date: review.event.date || text(overrides.date),
    time: review.event.time || text(overrides.time).slice(0, 5),
    location: review.event.location || text(overrides.location),
    city: review.event.city || text(overrides.city),
    durationHours:
      review.event.durationHours ||
      (Number.isFinite(duration) && duration > 0 ? duration : null),
  };
}

export function resolveQuoteConversionCustomer(
  review: QuoteConversionReview,
  overrides: QuoteConversionOverrides,
) {
  return {
    company: review.customer.company || text(overrides.customerCompany),
    rut: review.customer.rut || text(overrides.customerRut),
    contact: review.customer.contact || text(overrides.customerContact),
    email: review.customer.email || text(overrides.customerEmail).toLowerCase(),
    secondaryEmail: review.customer.secondaryEmail,
    phone: review.customer.phone || text(overrides.customerPhone),
    address: review.customer.address || text(overrides.customerAddress),
  };
}

export function assertQuoteConversionReady(
  review: QuoteConversionReview,
  overrides: QuoteConversionOverrides,
) {
  const event = resolveQuoteConversionEvent(review, overrides);
  const customer = resolveQuoteConversionCustomer(review, overrides);
  const paymentTerms = resolveQuoteConversionPaymentTerms(review, overrides);
  const missing = missingQuoteConversionFields({
    ...review,
    customer,
    event,
    financial: { ...review.financial, ...paymentTerms },
  });
  if (review.status !== "ACCEPTED")
    throw new Error("La cotización debe estar ACEPTADA.");
  if (missing.length)
    throw new Error(`Completa antes de crear: ${missing.join(", ")}.`);
  return event as Required<QuoteConversionReview["event"]>;
}
