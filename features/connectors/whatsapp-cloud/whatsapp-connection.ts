import "server-only";
import { disconnectedWhatsAppConnection, type WhatsAppSafeConnection } from "./whatsapp-connection.types";
import { logWhatsApp } from "./whatsapp-observability";

export const WHATSAPP_REQUIRED_ENV_KEYS = [
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_APP_ID",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_ACCESS_TOKEN",
] as const;

interface MetaPhoneResource {
  id?: string;
  display_phone_number?: string;
}

interface MetaSubscriptionResource {
  data?: Array<{ whatsapp_business_api_data?: { id?: string } }>;
}

interface MetaDebugTokenResource {
  data?: {
    is_valid?: boolean;
    app_id?: string;
    scopes?: string[];
    granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
  };
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
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const appId = process.env.WHATSAPP_APP_ID!.trim();
  if (!/^v\d+\.\d+$/.test(graphVersion) || !/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(wabaId)) {
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
    const subscriptionResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!subscriptionResponse.ok) {
      logWhatsApp("warn", "whatsapp_waba_subscription_check", correlationId, { status: "SUBSCRIPTION_UNAVAILABLE", httpStatus: subscriptionResponse.status });
      return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
    }
    const subscriptions = await subscriptionResponse.json() as MetaSubscriptionResource;
    // `subscribed_apps` lists subscribed applications; the nested id is the
    // App ID, not the WABA ID being queried.
    const subscriptionActive = (subscriptions.data ?? []).some((item) => item.whatsapp_business_api_data?.id === appId);
    if (!subscriptionActive) {
      logWhatsApp("warn", "whatsapp_waba_subscription_check", correlationId, { status: "NOT_SUBSCRIBED" });
      return disconnectedWhatsAppConnection("PROVIDER_UNAVAILABLE");
    }
    const debugResponse = await fetch(`https://graph.facebook.com/${graphVersion}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${process.env.WHATSAPP_APP_SECRET!.trim()}`)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!debugResponse.ok) {
      logWhatsApp("warn", "whatsapp_token_debug_failed", correlationId, { status: "TOKEN_INVALID", httpStatus: debugResponse.status });
      return disconnectedWhatsAppConnection("TOKEN_INVALID");
    }
    const debug = await debugResponse.json() as MetaDebugTokenResource;
    const tokenData = debug.data;
    const scopes = new Set(tokenData?.scopes ?? []);
    const granular = tokenData?.granular_scopes ?? [];
    const requiredScopes = ["whatsapp_business_messaging", "whatsapp_business_management"];
    const scopesValid = tokenData?.is_valid === true && tokenData.app_id === appId && requiredScopes.every((scope) => scopes.has(scope));
    const wabaAccessValid = ["whatsapp_business_management", "whatsapp_business_messaging"].every((scope) => granular.some((item) => item.scope === scope && (!item.target_ids?.length || item.target_ids.includes(wabaId))));
    if (!scopesValid || !wabaAccessValid) {
      logWhatsApp("warn", "whatsapp_token_scope_check_failed", correlationId, { status: "TOKEN_SCOPE_INVALID", requiredScopes, wabaAccessValid });
      return disconnectedWhatsAppConnection("TOKEN_INVALID");
    }
    logWhatsApp("info", "whatsapp_provider_health", correlationId, { status: "PROVIDER_READY" });
    return {
      connectionStatus: "CONNECTED",
      backendStatus: "PROVIDER_READY",
      provider: "Meta WhatsApp Cloud API",
      phone: maskedPhone(phone.display_phone_number),
      webhookActive: subscriptionActive,
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
