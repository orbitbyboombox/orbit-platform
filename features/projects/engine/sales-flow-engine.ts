import {
  BRANDING_RULE,
  getEventType,
  getQrRule,
  resolveVat,
  TRANSPORT_TABLE,
  type EventTypeId,
} from "@/features/business-core";
import type { SalesFlowDefinition, SalesFlowResult, SalesTimelineItem } from "./sales-flow.types";

const SOCIAL_EVENT_TYPES: readonly EventTypeId[] = ["WEDDING", "BIRTHDAY", "GRADUATION", "PARTY"];

export const SALES_TIMELINE: readonly SalesTimelineItem[] = [
  { id: "COMMERCIAL_OPPORTUNITY", label: "Oportunidad comercial" },
  { id: "QUOTATION", label: "Cotización" },
  { id: "ACCEPTED", label: "Aceptado" },
  { id: "CUSTOMER_ONBOARDING", label: "Onboarding del cliente" },
  { id: "CONFIRMED", label: "Confirmado" },
  { id: "PREPARATION", label: "Preparación" },
  { id: "LIVE_EVENT", label: "Evento en vivo" },
  { id: "DELIVERY", label: "Entrega" },
];

function createFlow(eventType: EventTypeId, type: SalesFlowDefinition["type"]): SalesFlowDefinition {
  const corporate = type === "CORPORATE";
  return {
    type,
    eventType,
    name: corporate ? "Experiencia corporativa" : "Experiencia social",
    recommendation: corporate ? "Generar cotización corporativa" : "Enviar catálogo",
    actionLabel: corporate ? "Generar cotización corporativa" : "Enviar catálogo",
    formalQuotation: corporate,
    officialCatalogRequired: !corporate,
    transportInformationRequired: !corporate,
    vat: resolveVat(eventType),
    qr: getQrRule(eventType),
    branding: BRANDING_RULE,
    transportRates: TRANSPORT_TABLE.rates,
    timeline: SALES_TIMELINE,
  };
}

export function resolveSalesFlow(eventType: EventTypeId): SalesFlowResult {
  if (eventType === "COMPANY") return { success: true, flow: createFlow(eventType, "CORPORATE") };
  if (SOCIAL_EVENT_TYPES.includes(eventType)) return { success: true, flow: createFlow(eventType, "SOCIAL") };
  return {
    success: false,
    error: {
      code: "UNSUPPORTED_EVENT_TYPE",
      eventType,
      message: `${getEventType(eventType).name} requiere clasificación comercial antes de seleccionar un flujo.`,
    },
  };
}

export function isSocialSalesFlow(eventType: EventTypeId): boolean {
  return SOCIAL_EVENT_TYPES.includes(eventType);
}
