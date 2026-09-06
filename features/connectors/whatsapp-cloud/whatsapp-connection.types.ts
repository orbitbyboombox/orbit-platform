export type WhatsAppBackendStatus =
  | "CONFIG_MISSING"
  | "TOKEN_INVALID"
  | "WEBHOOK_READY"
  | "PROVIDER_READY"
  | "PROVIDER_UNAVAILABLE";

export interface WhatsAppSafeConnection {
  connectionStatus: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
  backendStatus: WhatsAppBackendStatus;
  provider: "Meta WhatsApp Cloud API";
  phone: string | null;
  webhookActive: boolean;
  providerReady: boolean;
  controlsEnabled: boolean;
  lastCheckedAt: string | null;
}

export function disconnectedWhatsAppConnection(backendStatus: WhatsAppBackendStatus = "CONFIG_MISSING"): WhatsAppSafeConnection {
  return {
    connectionStatus: backendStatus === "CONFIG_MISSING" ? "NOT_CONNECTED" : "ERROR",
    backendStatus,
    provider: "Meta WhatsApp Cloud API",
    phone: null,
    webhookActive: false,
    providerReady: false,
    controlsEnabled: false,
    lastCheckedAt: null,
  };
}
