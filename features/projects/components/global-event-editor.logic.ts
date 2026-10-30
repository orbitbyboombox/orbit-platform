import type { GlobalEventItem } from "../actions/global-event-editor.actions";

export type GlobalEventEditorScope = "operational" | "commercial";

export function buildGlobalEventEditorChanges(input: {
  project: { name: string; eventDate: string; eventTime: string; location: string; city: string; eventAddress: string; notes: string };
  services: GlobalEventServiceInput[];
  schedule?: { serviceStartLocal?: string; serviceEndLocal?: string; staffCallLocal?: string };
  quotation?: { items: GlobalEventItem[]; discount: number; transport: number; vatPercent: number };
}, scope: GlobalEventEditorScope) {
  if (scope === "commercial") {
    if (!input.quotation) throw new Error("No hay una cotización editable.");
    return {
      items: input.quotation.items,
      discount: input.quotation.discount,
      transport: input.quotation.transport,
      vatPercent: input.quotation.vatPercent,
    };
  }

  return {
    name: input.project.name.trim(),
    eventDate: input.project.eventDate,
    eventTime: input.project.eventTime,
    location: input.project.location.trim(),
    city: input.project.city.trim(),
    eventAddress: input.project.eventAddress.trim(),
    notes: input.project.notes,
    services: input.services.map((service) => ({
      id: service.id || null,
      code: service.code.trim(),
      duration: service.duration,
      extras: service.extras,
      removed: Boolean(service.removed),
    })),
    ...(input.schedule ?? {}),
  };
}

type GlobalEventServiceInput = {
  id: string;
  code: string;
  duration: number;
  extras: string[];
  removed?: boolean;
};

export function calculateGlobalEventTotals(input: {
  items: readonly Pick<GlobalEventItem, "quantity" | "unitPrice">[];
  discount: number;
  transport: number;
  vatPercent: number;
  paid: number;
}) {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxable = Math.max(0, subtotal - input.discount + input.transport);
  const tax = Math.round(taxable * input.vatPercent / 100);
  const total = taxable + tax;
  return { subtotal, tax, total, paid: input.paid, balance: Math.max(0, total - input.paid) };
}

export function canApplyNewTotal(total: number, paid: number, invoiceClosed: boolean, currentAmount = total) {
  return Number.isFinite(total) && total >= paid && (!invoiceClosed || total === currentAmount);
}
