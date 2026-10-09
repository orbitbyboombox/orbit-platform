import type { ReceivableInvoice } from "./types";

export function normalizeFollowUpIds(savedIds: readonly string[], invoices: readonly ReceivableInvoice[]): string[] {
  const invoiceToProject = new Map(invoices.map((invoice) => [invoice.id, invoice.projectId]));
  return [...new Set(savedIds.map((id) => invoiceToProject.get(id) ?? id).filter(Boolean))];
}

export function mergeFollowUpIds(remoteProjectIds: readonly string[], localProjectIds: readonly string[]): string[] {
  return [...new Set([...remoteProjectIds, ...localProjectIds])].sort();
}
