import type { FormalQuoteDraft, QuoteLineDraft } from "./types";

export type CommercialQuoteHistoryEntry = {
  id: string;
  label: string;
  detail: string;
  occurredAt: string;
};

export type CommercialQuoteDetail = {
  id: string;
  number: string;
  version: number;
  status: string;
  customerId: string | null;
  projectId: string | null;
  createdAt: string;
  issueDate: string;
  expirationDate: string;
  acceptedAt: string | null;
  acceptedByFounder: boolean;
  convertedAt: string | null;
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
  };
  items: Array<{
    id: string;
    code: string;
    label: string;
    itemType: string;
    quantity: number;
    quotedPrice: number;
    total: number;
  }>;
  financial: {
    subtotal: number;
    discount: number;
    net: number;
    tax: number;
    total: number;
    depositPercent: number;
    deposit: number;
    balance: number;
  };
  conditions: string[];
  history: CommercialQuoteHistoryEntry[];
  draft?: FormalQuoteDraft;
};

type QuoteRow = Record<string, unknown> & {
  quotation_items?: unknown[] | null;
  customers?: unknown;
};

type SendRow = Record<string, unknown>;

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

export function commercialQuoteHref(quoteId: string) {
  return `/quotes/${encodeURIComponent(quoteId)}`;
}

export function quoteDetailActions(status: string, projectId: string | null) {
  return {
    canEdit: status === "DRAFT",
    canAccept: ["SENT", "VIEWED"].includes(status),
    canConvert: status === "ACCEPTED" && !projectId,
    isConverted: Boolean(projectId),
  };
}

export function buildCommercialQuoteDetail(
  row: QuoteRow,
  sends: readonly SendRow[] = [],
): CommercialQuoteDetail {
  const id = text(row.id);
  const acceptedSnapshot = record(row.accepted_snapshot);
  const acceptedQuotation = record(acceptedSnapshot.quotation);
  const acceptedCommercial = record(acceptedSnapshot.commercial);
  const currentCommercial = record(row.commercial_snapshot);
  const commercial = Object.keys(acceptedCommercial).length
    ? acceptedCommercial
    : currentCommercial;
  const acceptedCustomer = record(acceptedSnapshot.customer);
  const currentCustomer = record(row.customer_snapshot);
  const relatedCustomer = Array.isArray(row.customers)
    ? record(row.customers[0])
    : record(row.customers);
  const customerSource = Object.keys(acceptedCustomer).length
    ? acceptedCustomer
    : currentCustomer;
  const event = record(commercial.event);
  const sourceItems = Array.isArray(acceptedSnapshot.items)
    ? acceptedSnapshot.items
    : row.quotation_items ?? [];
  const items = sourceItems
    .map((value, index) => {
      const item = record(value);
      return {
        id: text(item.id) || `${id}:${index}`,
        code: text(item.code) || `ITEM-${index + 1}`,
        label:
          text(item.label) ||
          text(item.description) ||
          text(item.code) ||
          `Ítem ${index + 1}`,
        itemType: text(item.itemType) || text(item.item_type) || "SERVICE",
        quantity: Math.max(1, number(item.quantity, 1)),
        quotedPrice: number(item.quotedPrice, number(item.quoted_price, number(item.unit_price))),
        total: number(item.total),
        displayOrder: number(item.displayOrder, number(item.display_order, index)),
        catalogPrice:
          item.catalogPrice === null || item.catalogPrice === undefined
            ? item.catalog_price === null || item.catalog_price === undefined
              ? null
              : number(item.catalog_price)
            : number(item.catalogPrice),
        discountType: text(item.discount_type) || null,
        discountValue: number(item.discount_value),
        manual: Boolean(item.isManual ?? item.is_manual),
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const subtotal = number(commercial.subtotal, number(row.subtotal));
  const discount = number(commercial.discount, number(row.discount_total));
  const net = number(commercial.net, Math.max(0, subtotal - discount));
  const tax = number(commercial.tax, number(row.tax_total));
  const total = number(
    commercial.total,
    number(row.final_customer_price, number(row.grand_total, net + tax)),
  );
  const depositPercent = number(
    commercial.depositPercent,
    number(acceptedQuotation.depositPercent, number(row.deposit_percent, 50)),
  );
  const deposit = number(
    commercial.deposit,
    Math.round((total * depositPercent) / 100),
  );
  const customer = {
    company: text(customerSource.company) || text(relatedCustomer.company),
    rut: text(customerSource.rut) || text(relatedCustomer.rut),
    contact:
      text(customerSource.contact) || text(relatedCustomer.full_name),
    email: text(customerSource.email) || text(relatedCustomer.email),
    secondaryEmail:
      text(customerSource.secondaryEmail) ||
      text(relatedCustomer.secondary_email),
    phone: text(customerSource.phone) || text(relatedCustomer.phone),
    address: text(customerSource.address) || text(relatedCustomer.address),
  };
  const status = text(row.status);
  const history: CommercialQuoteHistoryEntry[] = [
    {
      id: `${id}:created`,
      label: "Cotización creada",
      detail: `Estado inicial DRAFT · revisión ${Math.max(1, number(row.version, 1))}`,
      occurredAt: text(row.created_at),
    },
    ...sends.map((send) => ({
      id: text(send.id),
      label: "Cotización enviada",
      detail: [
        text(send.recipient_email),
        Array.isArray(send.cc_recipients) && send.cc_recipients.length
          ? `CC: ${send.cc_recipients.join(", ")}`
          : "",
        text(send.status),
      ]
        .filter(Boolean)
        .join(" · "),
      occurredAt: text(send.sent_at) || text(send.created_at),
    })),
    ...(text(row.approved_at)
      ? [
          {
            id: `${id}:accepted`,
            label: "Cotización aceptada",
            detail: text(row.approval_reason) || "Aceptación comercial confirmada.",
            occurredAt: text(row.approved_at),
          },
        ]
      : []),
    ...(text(row.converted_at)
      ? [
          {
            id: `${id}:converted`,
            label: "Reserva generada",
            detail: "La cotización quedó vinculada a un único Evento canónico.",
            occurredAt: text(row.converted_at),
          },
        ]
      : []),
  ].filter((entry) => entry.occurredAt);
  history.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const draftItems: QuoteLineDraft[] = items.map((item) => ({
    id: item.id,
    code: item.code,
    description: item.label,
    quantity: item.quantity,
    catalogPrice: item.catalogPrice,
    quotedPrice: item.quotedPrice,
    discountType:
      item.discountType === "CLP" || item.discountType === "PERCENT"
        ? item.discountType
        : null,
    discountValue: item.discountValue,
    manual: item.manual,
  }));

  return {
    id,
    number: text(row.quotation_number),
    version: Math.max(1, number(row.version, 1)),
    status,
    customerId: text(row.customer_id) || null,
    projectId: text(row.project_id) || null,
    createdAt: text(row.created_at),
    issueDate: text(acceptedQuotation.issueDate) || text(row.issue_date),
    expirationDate:
      text(acceptedQuotation.expirationDate) || text(row.expiration_date),
    acceptedAt:
      text(acceptedQuotation.acceptedAt) || text(row.approved_at) || null,
    acceptedByFounder: Boolean(row.approved_by),
    convertedAt: text(row.converted_at) || null,
    customer,
    event: {
      name: text(event.name),
      date: text(event.date),
      time: text(event.time).slice(0, 5),
      location: text(event.location),
      city: text(event.city),
    },
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      itemType: item.itemType,
      quantity: item.quantity,
      quotedPrice: item.quotedPrice,
      total: item.total,
    })),
    financial: {
      subtotal,
      discount,
      net,
      tax,
      total,
      depositPercent,
      deposit,
      balance: number(commercial.balance, Math.max(0, total - deposit)),
    },
    conditions: Array.isArray(commercial.conditions)
      ? commercial.conditions.map(text).filter(Boolean)
      : [],
    history,
    ...(status === "DRAFT"
      ? {
          draft: {
            quoteId: id,
            requestId: id,
            existingCustomerId: text(row.customer_id) || null,
            saveTemporaryCustomer: false,
            ...customer,
            eventName: text(event.name),
            eventDate: text(event.date),
            eventTime: text(event.time).slice(0, 5),
            eventLocation: text(event.location),
            eventCity: text(event.city),
            validityDays: Math.max(1, number(row.validity_days, 10)),
            depositPercent,
            globalDiscountType:
              row.global_discount_type === "CLP" ||
              row.global_discount_type === "PERCENT"
                ? row.global_discount_type
                : null,
            globalDiscountValue: number(row.global_discount_value),
            attachCatalog: false,
            lines: draftItems,
          },
        }
      : {}),
  };
}
