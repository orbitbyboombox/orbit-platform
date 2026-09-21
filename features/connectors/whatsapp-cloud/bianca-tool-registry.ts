export const BIANCA_TOOL_NAMES = [
  "CUSTOMER_LOOKUP", "WEB_LEAD_CONTEXT", "CATALOG_LOOKUP", "SEND_CATALOG",
  "PRICE_LOOKUP", "AVAILABILITY_LOOKUP", "COMMUNE_LOOKUP", "VENUE_LOOKUP",
  "SURCHARGE_LOOKUP", "SERVICE_LOOKUP", "PLAN_COMPARE", "QUOTE_CREATE",
  "RESERVATION_START", "PAYMENT_INFO", "SEND_EMAIL", "HANDOFF",
  "CONVERSATION_STATE_UPDATE",
] as const;

export type BiancaToolName = (typeof BIANCA_TOOL_NAMES)[number];

export interface BiancaToolContract {
  name: BiancaToolName;
  timeoutMs: number;
  permission: "CUSTOMER_SAFE" | "FOUNDER_ONLY";
  idempotent: boolean;
}

export const BIANCA_TOOL_REGISTRY: Record<BiancaToolName, BiancaToolContract> = Object.fromEntries(
  BIANCA_TOOL_NAMES.map((name) => [name, {
    name,
    timeoutMs: name === "AVAILABILITY_LOOKUP" || name === "PRICE_LOOKUP" ? 3_000 : 8_000,
    permission: name === "HANDOFF" || name === "CONVERSATION_STATE_UPDATE" ? "FOUNDER_ONLY" : "CUSTOMER_SAFE",
    idempotent: !["QUOTE_CREATE", "RESERVATION_START", "SEND_EMAIL"].includes(name),
  }]),
) as Record<BiancaToolName, BiancaToolContract>;
