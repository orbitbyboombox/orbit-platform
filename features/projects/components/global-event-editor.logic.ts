import type { GlobalEventItem } from "../actions/global-event-editor.actions";

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
