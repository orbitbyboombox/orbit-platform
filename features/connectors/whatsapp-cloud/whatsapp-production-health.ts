import "server-only";

const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"] as const;
const EXPECTED_BIANCA_PHONE = "56930130927";

type MetaResponse = {
  endpoint: string;
  status: number;
  body: Record<string, unknown>;
};

export interface WhatsAppMetaDiagnostic {
  endpoint: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorSubcode: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

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
  return { endpoint: `${path}${url.search ? url.search.replace(/access_token=[^&]+/g, "access_token=[redacted]") : ""}`, status: response.status, body };
}

function diagnostic(response: MetaResponse): WhatsAppMetaDiagnostic {
  const error = response.body.error && typeof response.body.error === "object" ? response.body.error as Record<string, unknown> : null;
  const message = typeof error?.message === "string" ? error.message.replace(/access_token=[^\s&]+/gi, "access_token=[redacted]").replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]") : null;
  return {
    endpoint: response.endpoint,
    httpStatus: response.status,
    errorCode: error?.code === undefined ? null : String(error.code),
    errorSubcode: error?.error_subcode === undefined ? null : String(error.error_subcode),
    errorType: typeof error?.type === "string" ? error.type : null,
    errorMessage: message,
  };
}

export interface WhatsAppProductionHealth {
  TOKEN_VALID: boolean;
  APP_ID_VALID: boolean;
  SCOPES_VALID: boolean;
  WABA_VALID: boolean;
  PHONE_VALID: boolean;
  PHONE_WABA_MAPPING_VALID: boolean;
  PHONE_WABA_ACTUAL_ID: string | null;
  PHONE_WABA_EXPECTED_ID: string;
  PHONE_WABA_MATCH: boolean;
  WABA_ACCESS_STATUS: "PASS" | "NOT_FOUND" | "FORBIDDEN" | "ERROR" | "NOT_CHECKED";
  EXPECTED_WABA_API_ACCESS: boolean;
  ACTUAL_WABA_API_ACCESS: boolean;
  SUBSCRIBED_APP_FOUND: boolean;
  TEMPLATES_API_STATUS: "PASS" | "FORBIDDEN" | "ERROR" | "NOT_CHECKED";
  diagnostics: WhatsAppMetaDiagnostic[];
  ACCESSIBLE_WABA_IDS: string[];
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
    APP_ID_VALID: false,
    SCOPES_VALID: false,
    WABA_VALID: false,
    PHONE_VALID: false,
    PHONE_WABA_MAPPING_VALID: false,
    PHONE_WABA_ACTUAL_ID: null,
    PHONE_WABA_EXPECTED_ID: wabaId,
    PHONE_WABA_MATCH: false,
    WABA_ACCESS_STATUS: "NOT_CHECKED",
    EXPECTED_WABA_API_ACCESS: false,
    ACTUAL_WABA_API_ACCESS: false,
    SUBSCRIBED_APP_FOUND: false,
    TEMPLATES_API_STATUS: "NOT_CHECKED",
    MESSAGES_SUBSCRIBED: false,
    diagnostics: [],
    ACCESSIBLE_WABA_IDS: [],
    approvedTemplates: [],
    checkedAt: new Date().toISOString(),
  };

  try {
    const [debug, waba, phone, phoneWaba, subscriptions, templates, businesses] = await Promise.all([
      getMeta(base, token, "/debug_token", { input_token: token, access_token: `${appId}|${appSecret}` }),
      getMeta(base, token, `/${wabaId}`, { fields: "id" }),
      getMeta(base, token, `/${phoneId}`, { fields: "id,display_phone_number" }),
      getMeta(base, token, `/${phoneId}/whatsapp_business_account`),
      getMeta(base, token, `/${wabaId}/subscribed_apps`),
      getMeta(base, token, `/${wabaId}/message_templates`, { fields: "name,language,status,category" }),
      getMeta(base, token, "/me/businesses", { fields: "id,name" }),
    ]);
    result.diagnostics.push(...[debug, waba, phone, phoneWaba, subscriptions, templates, businesses].map(diagnostic));

    const debugData = (debug.body.data ?? {}) as Record<string, unknown>;
    const scopes = Array.isArray(debugData.scopes) ? debugData.scopes.filter((value): value is string => typeof value === "string") : [];
    const granular = Array.isArray(debugData.granular_scopes) ? debugData.granular_scopes : [];
    result.APP_ID_VALID = debug.status === 200 && debugData.app_id === appId;
    result.TOKEN_VALID = result.APP_ID_VALID && debugData.is_valid === true;
    result.SCOPES_VALID = result.TOKEN_VALID && REQUIRED_SCOPES.every((scope) => scopes.includes(scope)) && REQUIRED_SCOPES.every((scope) =>
      granular.some((item) => {
        if (!item || typeof item !== "object") return false;
        const entry = item as { scope?: unknown; target_ids?: unknown };
        const targets = Array.isArray(entry.target_ids) ? entry.target_ids : [];
        return entry.scope === scope && (targets.length === 0 || targets.includes(wabaId));
      }),
    );
    result.WABA_VALID = waba.status === 200 && (waba.body.id === wabaId || (waba.body.error as Record<string, unknown> | undefined)?.code === 0);
    result.EXPECTED_WABA_API_ACCESS = waba.status === 200;
    result.WABA_ACCESS_STATUS = waba.status === 200 ? "PASS" : waba.status === 403 ? "FORBIDDEN" : waba.status === 404 ? "NOT_FOUND" : "ERROR";
    result.PHONE_VALID = phone.status === 200 && phone.body.id === phoneId && digits(phone.body.display_phone_number) === EXPECTED_BIANCA_PHONE;
    const phoneWabaRows = Array.isArray(phoneWaba.body.data) ? phoneWaba.body.data : [];
    const actualWabaId = phoneWabaRows.find((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") as { id?: string } | undefined;
    result.PHONE_WABA_ACTUAL_ID = actualWabaId?.id ?? null;
    result.PHONE_WABA_MATCH = Boolean(result.PHONE_WABA_ACTUAL_ID && result.PHONE_WABA_ACTUAL_ID === wabaId);
    result.PHONE_WABA_MAPPING_VALID = phoneWaba.status === 200 && result.PHONE_WABA_MATCH;
    let actualWabaResponse: MetaResponse | null = null;
    let actualSubscriptions = subscriptions;
    let actualTemplates = templates;
    if (result.PHONE_WABA_ACTUAL_ID) {
      [actualWabaResponse, actualSubscriptions, actualTemplates] = await Promise.all([
        getMeta(base, token, `/${result.PHONE_WABA_ACTUAL_ID}`, { fields: "id,name" }),
        getMeta(base, token, `/${result.PHONE_WABA_ACTUAL_ID}/subscribed_apps`),
        getMeta(base, token, `/${result.PHONE_WABA_ACTUAL_ID}/message_templates`, { fields: "name,language,status,category" }),
      ]);
      result.diagnostics.push(...[actualWabaResponse, actualSubscriptions, actualTemplates].filter((item): item is MetaResponse => Boolean(item)).map(diagnostic));
    }
    result.ACTUAL_WABA_API_ACCESS = actualWabaResponse?.status === 200;
    const subscribed = Array.isArray(actualSubscriptions.body.data) ? actualSubscriptions.body.data : [];
    result.SUBSCRIBED_APP_FOUND = actualSubscriptions.status === 200 && subscribed.some((item) => {
      if (!item || typeof item !== "object") return false;
      const apiData = (item as { whatsapp_business_api_data?: { id?: unknown } }).whatsapp_business_api_data;
      // Meta returns the subscribed application's id here, not the WABA id.
      return apiData?.id === appId;
    });
    result.MESSAGES_SUBSCRIBED = result.SUBSCRIBED_APP_FOUND;
    const templateRows = Array.isArray(actualTemplates.body.data) ? actualTemplates.body.data : [];
    result.approvedTemplates = templateRows.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { name?: unknown; language?: unknown; status?: unknown; category?: unknown };
      if (row.status !== "APPROVED" || typeof row.name !== "string") return [];
      return [{ name: row.name, language: typeof row.language === "string" ? row.language : "", category: typeof row.category === "string" ? row.category : "" }];
    });
    result.TEMPLATES_API_STATUS = actualTemplates.status === 200 ? "PASS" : actualTemplates.status === 403 ? "FORBIDDEN" : "ERROR";
    if (actualTemplates.status !== 200 && actualTemplates.status !== 403) result.errorCode = "TEMPLATES_UNAVAILABLE";

    const businessRows = Array.isArray(businesses.body.data) ? businesses.body.data : [];
    for (const business of businessRows) {
      if (!business || typeof business !== "object" || typeof (business as { id?: unknown }).id !== "string") continue;
      const owned = await getMeta(base, token, `/${(business as { id: string }).id}/owned_whatsapp_business_accounts`, { fields: "id,name" });
      result.diagnostics.push(diagnostic(owned));
      if (owned.status !== 200 || !Array.isArray(owned.body.data)) continue;
      for (const item of owned.body.data) {
        if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") result.ACCESSIBLE_WABA_IDS.push((item as { id: string }).id);
      }
    }
    result.ACCESSIBLE_WABA_IDS = [...new Set(result.ACCESSIBLE_WABA_IDS)];
  } catch (error) {
    result.errorCode = errorCode(error);
  }
  return result;
}
