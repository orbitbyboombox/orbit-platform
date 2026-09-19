import "server-only";

const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"] as const;
const EXPECTED_BIANCA_PHONE = "56930130927";

type MetaResponse = {
  status: number;
  body: Record<string, unknown>;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function digits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function errorCode(error: unknown) {
  if (error instanceof Error && /^MISSING_[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "META_HEALTH_UNAVAILABLE";
}

async function getMeta(base: string, token: string, path: string, params?: Record<string, string>): Promise<MetaResponse> {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  let body: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // The public result remains sanitized below.
  }
  return { status: response.status, body };
}

export interface WhatsAppProductionHealth {
  TOKEN_VALID: boolean;
  SCOPES_VALID: boolean;
  WABA_VALID: boolean;
  PHONE_VALID: boolean;
  MESSAGES_SUBSCRIBED: boolean;
  approvedTemplates: Array<{ name: string; language: string; category: string }>;
  checkedAt: string;
  errorCode?: string;
}

export async function runWhatsAppProductionHealthCheck(): Promise<WhatsAppProductionHealth> {
  const base = `https://graph.facebook.com/${env("WHATSAPP_GRAPH_VERSION")}`;
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const appId = env("WHATSAPP_APP_ID");
  const appSecret = env("WHATSAPP_APP_SECRET");
  const wabaId = env("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");

  const result: WhatsAppProductionHealth = {
    TOKEN_VALID: false,
    SCOPES_VALID: false,
    WABA_VALID: false,
    PHONE_VALID: false,
    MESSAGES_SUBSCRIBED: false,
    approvedTemplates: [],
    checkedAt: new Date().toISOString(),
  };

  try {
    const [debug, waba, phone, subscriptions, templates] = await Promise.all([
      getMeta(base, token, "/debug_token", { input_token: token, access_token: `${appId}|${appSecret}` }),
      getMeta(base, token, `/${wabaId}`, { fields: "id" }),
      getMeta(base, token, `/${phoneId}`, { fields: "id,display_phone_number" }),
      getMeta(base, token, `/${wabaId}/subscribed_apps`),
      getMeta(base, token, `/${wabaId}/message_templates`, { fields: "name,language,status,category" }),
    ]);

    const debugData = (debug.body.data ?? {}) as Record<string, unknown>;
    const scopes = Array.isArray(debugData.scopes) ? debugData.scopes.filter((value): value is string => typeof value === "string") : [];
    const granular = Array.isArray(debugData.granular_scopes) ? debugData.granular_scopes : [];
    result.TOKEN_VALID = debug.status === 200 && debugData.is_valid === true && debugData.app_id === appId;
    result.SCOPES_VALID = result.TOKEN_VALID && REQUIRED_SCOPES.every((scope) => scopes.includes(scope)) && REQUIRED_SCOPES.every((scope) =>
      granular.some((item) => {
        if (!item || typeof item !== "object") return false;
        const entry = item as { scope?: unknown; target_ids?: unknown };
        const targets = Array.isArray(entry.target_ids) ? entry.target_ids : [];
        return entry.scope === scope && (targets.length === 0 || targets.includes(wabaId));
      }),
    );
    result.WABA_VALID = waba.status === 200 && (waba.body.id === wabaId || (waba.body.error as Record<string, unknown> | undefined)?.code === 0);
    result.PHONE_VALID = phone.status === 200 && phone.body.id === phoneId && digits(phone.body.display_phone_number) === EXPECTED_BIANCA_PHONE;
    const subscribed = Array.isArray(subscriptions.body.data) ? subscriptions.body.data : [];
    result.MESSAGES_SUBSCRIBED = subscriptions.status === 200 && subscribed.some((item) => {
      if (!item || typeof item !== "object") return false;
      const apiData = (item as { whatsapp_business_api_data?: { id?: unknown } }).whatsapp_business_api_data;
      return apiData?.id === wabaId;
    });
    const templateRows = Array.isArray(templates.body.data) ? templates.body.data : [];
    result.approvedTemplates = templateRows.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { name?: unknown; language?: unknown; status?: unknown; category?: unknown };
      if (row.status !== "APPROVED" || typeof row.name !== "string") return [];
      return [{ name: row.name, language: typeof row.language === "string" ? row.language : "", category: typeof row.category === "string" ? row.category : "" }];
    });
    if (templates.status !== 200 && templates.status !== 403) result.errorCode = "TEMPLATES_UNAVAILABLE";
  } catch (error) {
    result.errorCode = errorCode(error);
  }
  return result;
}
