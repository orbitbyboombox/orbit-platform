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

export function biancaSimulationEnabled() {
  // Founder simulation is safe by default; it never authorizes customer
  // delivery and is independently constrained by the server-side gates.
  return process.env.BIANCA_SIMULATION_ENABLED?.trim().toLowerCase() !== "false";
}

export function biancaCanProcessCustomerMessage() {
  return biancaCustomerMessagingEnabled() && biancaAiEnabled();
}

export const BIANCA_INTRODUCTION = "¡Hola! Soy BIANCA de BOOMBOX 😊";

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
