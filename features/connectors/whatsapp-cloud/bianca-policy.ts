import type { NovaConversationStatus } from "@/features/nova-channel";

/**
 * BIANCA is deliberately fail-closed. These gates are server-side only and
 * must never be replaced by client-side switches.
 */
export function biancaCustomerMessagingEnabled() {
  return process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED?.trim().toLowerCase() === "true";
}

export function biancaAiEnabled() {
  return process.env.BIANCA_AI_ENABLED?.trim().toLowerCase() === "true";
}

export function biancaOutboundEnabled() {
  return process.env.BIANCA_OUTBOUND_ENABLED?.trim().toLowerCase() === "true";
}

export function biancaFounderNotificationsEnabled() {
  return process.env.BIANCA_FOUNDER_NOTIFICATIONS_ENABLED?.trim().toLowerCase() === "true";
}

export function biancaSimulationEnabled() {
  // Founder simulation is safe by default; it never authorizes customer
  // delivery and is independently constrained by the server-side gates.
  return process.env.BIANCA_SIMULATION_ENABLED?.trim().toLowerCase() !== "false";
}

export function biancaCanProcessCustomerMessage() {
  return biancaCustomerMessagingEnabled() && biancaAiEnabled() && biancaOutboundEnabled();
}

export const BIANCA_INTRODUCTION = "¡Hola! Soy BIANCA de BOOMBOX 😊";

// The automated number and the official human sales number are deliberately
// separate. BIANCA only offers a wa.me handoff; it never attempts to migrate
// or copy the conversation between WhatsApp numbers.
export const BIANCA_WHATSAPP_NUMBER = "+56930130927";
export const OFFICIAL_SALES_WHATSAPP_NUMBER = "+56963040989";
export const OFFICIAL_SALES_WHATSAPP_URL = "https://wa.me/56963040989?text=Hola%20BOOMBOX%2C%20vengo%20desde%20BIANCA%20y%20necesito%20atenci%C3%B3n%20de%20su%20equipo.";

export function officialSalesHandoffCopy() {
  return `HABLAR CON EQUIPO BOOMBOX: ${OFFICIAL_SALES_WHATSAPP_URL}`;
}

const FOUNDER_REQUEST = /\b(?:hola\s+)?mat[ií]as\b|\b(?:quiero|necesito|puedo)\s+hablar\s+con\s+(?:mat[ií]as|el\s+fundador|una\s+persona)\b|\b(?:est[aá]|se\s+encuentra)\s+mat[ií]as\b/i;

export function isFounderRequest(text: string) {
  return FOUNDER_REQUEST.test(text.trim());
}

export function founderRequestResponse() {
  return `${BIANCA_INTRODUCTION}\nMatías recibe tus mensajes por acá. Le aviso para que pueda continuar contigo.`;
}

export function safeBiancaStatus(input: { status: NovaConversationStatus; humanHandoff: boolean }) {
  if (input.humanHandoff || input.status === "HUMAN_HANDOFF") return "BIANCA_PAUSED" as const;
  if (input.status === "WAITING_CUSTOMER") return "BIANCA_ACTIVA" as const;
  return "BIANCA_ACTIVA" as const;
}
