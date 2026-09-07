import { biancaAiEnabled, biancaCustomerMessagingEnabled, biancaOutboundEnabled } from "../connectors/whatsapp-cloud/bianca-policy.ts";

export type BiancaOperationalStatus = "PREPARADA" | "DESCONECTADA" | "PAUSADA" | "ACTIVA" | "REQUIERE ATENCIÓN";

export function getBiancaOperationalStatus(input: { whatsappConnected: boolean; active: number; human: number }): BiancaOperationalStatus {
  if (input.human > 0) return "REQUIERE ATENCIÓN";
  if (!input.whatsappConnected) return "PREPARADA";
  if (!biancaCustomerMessagingEnabled() || !biancaAiEnabled() || !biancaOutboundEnabled()) return "PAUSADA";
  return "ACTIVA";
}

export function getBiancaDeliveryLabels() {
  return {
    engine: "Listo",
    messaging: biancaCustomerMessagingEnabled() ? "Activada" : "Desactivada",
    ai: biancaAiEnabled() ? "Activada" : "Desactivada",
  } as const;
}
