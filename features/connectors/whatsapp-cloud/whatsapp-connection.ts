import "server-only";
import { disconnectedWhatsAppConnection, type WhatsAppSafeConnection } from "./whatsapp-connection.types";
import { logWhatsApp } from "./whatsapp-observability";

export const WHATSAPP_REQUIRED_ENV_KEYS = [
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
] as const;

interface MetaPhoneResource {
  id?: string;
  display_phone_number?: string;
}

function maskedPhone(value: string | undefined) {
  if (!value) return "Número verificado";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "Número verificado";
  const prefix = digits.startsWith("56") ? "+56" : "+";
  return `${prefix} •••• ${digits.slice(-4)}`;
}

export async function loadWhatsAppConnection(): Promise<WhatsAppSafeConnection> {
  const correlationId = crypto.randomUUID();
  const missing = WHATSAPP_REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  logWhatsApp(missing.length ? "warn" : "info", "whatsapp_config_check", correlationId, {
    status: missing.length ? "CONFIG_MISSING" : "WEBHOOK_READY",
    missing,
  });
  if (missing.length) return disconnectedWhatsAppConnection();

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION!.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  if (!/^v\d+\.\d+$/.test(graphVersion) || !/^\d+$/.test(phoneNumberId)) {
    logWhatsApp("warn", "whatsapp_provider_health", correlationId, { status: "PROVIDER_UNAVAILABLE" });
    return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      logWhatsApp("warn", "whatsapp_provider_health", correlationId, { status: "TOKEN_INVALID" });
      return disconnectedWhatsAppConnection("TOKEN_INVALID");
    }
    if (!response.ok) {
      logWhatsApp("warn", "whatsapp_provider_health", correlationId, { status: "PROVIDER_UNAVAILABLE", httpStatus: response.status });
      return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
    }
    const phone = await response.json() as MetaPhoneResource;
    if (phone.id !== phoneNumberId) {
      logWhatsApp("warn", "whatsapp_provider_health", correlationId, { status: "PROVIDER_UNAVAILABLE" });
      return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
    }
    logWhatsApp("info", "whatsapp_provider_health", correlationId, { status: "PROVIDER_READY" });
    return {
      connectionStatus: "CONNECTED",
      backendStatus: "PROVIDER_READY",
      provider: "Meta WhatsApp Cloud API",
      phone: maskedPhone(phone.display_phone_number),
      webhookActive: true,
      providerReady: true,
      controlsEnabled: true,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch {
    logWhatsApp("warn", "whatsapp_provider_health", correlationId, { status: "PROVIDER_UNAVAILABLE" });
    return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
