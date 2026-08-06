import type { EventTypeId, VatDecision, VatRule } from "../types";

export const CHILE_VAT_RATE = 0.19;

export const VAT_RULES: Readonly<Record<EventTypeId, VatRule>> = {
  COMPANY: { eventType: "COMPANY", mode: "EXCLUSIVE", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: true, label: "+ IVA" },
  WEDDING: { eventType: "WEDDING", mode: "CONDITIONAL", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: true, label: "IVA incluido; + IVA si solicita factura" },
  BIRTHDAY: { eventType: "BIRTHDAY", mode: "INCLUDED", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: false, label: "IVA incluido" },
  GRADUATION: { eventType: "GRADUATION", mode: "INCLUDED", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: false, label: "IVA incluido" },
  PARTY: { eventType: "PARTY", mode: "INCLUDED", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: false, label: "IVA incluido" },
  PUBLIC_EVENT: { eventType: "PUBLIC_EVENT", mode: "EXCLUSIVE", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: true, label: "+ IVA" },
  OTHER: { eventType: "OTHER", mode: "REQUIRES_REVIEW", rate: CHILE_VAT_RATE, invoiceRequestedAppliesVat: false, label: "Requiere revisión comercial" },
};

export function getVatRule(eventType: EventTypeId): VatRule {
  return VAT_RULES[eventType];
}

export function resolveVat(eventType: EventTypeId, invoiceRequested = false): VatDecision {
  const rule = getVatRule(eventType);
  const applyVat = rule.mode === "EXCLUSIVE" || (rule.mode === "CONDITIONAL" && invoiceRequested && rule.invoiceRequestedAppliesVat);
  return {
    applyVat,
    mentionVatSeparately: applyVat,
    mode: rule.mode,
    rate: rule.rate,
    requiresReview: rule.mode === "REQUIRES_REVIEW",
  };
}
