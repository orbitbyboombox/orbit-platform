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

function sanitizeMessage(value: unknown) {
  if (typeof value !== "string") return null;
  return value
    .replace(/EAAg[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(?:input_token|access_token|appsecret_proof|authorization)\s*=\s*[^\s&]+/gi, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(?:input_token|access_token|appsecret_proof|authorization)/gi, "redacted");
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
  // Diagnostics never echo query strings. This prevents input_token,
  // access_token, appsecret_proof or any future credential from leaking.
  return { endpoint: path, status: response.status, body };
}

function diagnostic(response: MetaResponse): WhatsAppMetaDiagnostic {
  const error = response.body.error && typeof response.body.error === "object" ? response.body.error as Record<string, unknown> : null;
  const message = sanitizeMessage(error?.message);
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
  PHONE_WABA_MAPPING_STATUS: "NOT_CHECKED" | "UNSUPPORTED_ENDPOINT";
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
    PHONE_WABA_MAPPING_STATUS: "NOT_CHECKED",
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
    const [debug, waba, phone, subscriptions, templates, businesses] = await Promise.all([
      getMeta(base, token, "/debug_token", { input_token: token, access_token: `${appId}|${appSecret}` }),
      getMeta(base, token, `/${wabaId}`, { fields: "id" }),
      getMeta(base, token, `/${phoneId}`, { fields: "id,display_phone_number" }),
      getMeta(base, token, `/${wabaId}/subscribed_apps`),
      getMeta(base, token, `/${wabaId}/message_templates`, { fields: "name,language,status,category" }),
      getMeta(base, token, "/me/businesses", { fields: "id,name" }),
    ]);
    result.diagnostics.push(...[debug, waba, phone, subscriptions, templates, businesses].map(diagnostic));

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
    // Meta Graph does not expose a valid `/{phone_id}/whatsapp_business_account`
    // edge for this object/version. Do not treat it as a mapping signal.
    result.PHONE_WABA_MAPPING_STATUS = "UNSUPPORTED_ENDPOINT";
    const actualSubscriptions = subscriptions;
    const actualTemplates = templates;
    result.ACTUAL_WABA_API_ACCESS = false;
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

export interface OfficialWhatsAppAudit {
  OFFICIAL_WABA_ID: string;
  OFFICIAL_WABA_ACCESS: boolean;
  OFFICIAL_PHONE_NUMBER_ID: string | null;
  OFFICIAL_PHONE_NUMBER_FOUND: boolean;
  SYSTEM_USER_ACCESS: boolean;
  SUBSCRIBED_APPS: boolean;
  TEMPLATES: boolean;
  CURRENT_CONNECTION_MODE: string;
  COEXISTENCE_SAFE: "YES" | "NO" | "UNKNOWN";
  RISK_TO_CURRENT_WHATSAPP_APP: "LOW" | "MEDIUM" | "HIGH";
  diagnostics: WhatsAppMetaDiagnostic[];
  checkedAt: string;
}

/** Read-only audit for the existing human BOOMBOX number. It never mutates Meta. */
export async function runOfficialWhatsAppAudit(): Promise<OfficialWhatsAppAudit> {
  const officialWabaId = "110815468374911";
  const expectedDigits = "56963040989";
  const base = `https://graph.facebook.com/${env("WHATSAPP_GRAPH_VERSION")}`;
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const appId = env("WHATSAPP_APP_ID");
  const appSecret = env("WHATSAPP_APP_SECRET");
  const result: OfficialWhatsAppAudit = {
    OFFICIAL_WABA_ID: officialWabaId,
    OFFICIAL_WABA_ACCESS: false,
    OFFICIAL_PHONE_NUMBER_ID: null,
    OFFICIAL_PHONE_NUMBER_FOUND: false,
    SYSTEM_USER_ACCESS: false,
    SUBSCRIBED_APPS: false,
    TEMPLATES: false,
    CURRENT_CONNECTION_MODE: "UNKNOWN",
    COEXISTENCE_SAFE: "UNKNOWN",
    RISK_TO_CURRENT_WHATSAPP_APP: "HIGH",
    diagnostics: [],
    checkedAt: new Date().toISOString(),
  };

  try {
    const [waba, phoneNumbers, debug, subscriptions, templates] = await Promise.all([
      getMeta(base, token, `/${officialWabaId}`, { fields: "id,name" }),
      getMeta(base, token, `/${officialWabaId}/phone_numbers`, { fields: "id,display_phone_number,status,verified_name,code_verification_status,quality_rating,platform" }),
      getMeta(base, token, "/debug_token", { input_token: token, access_token: `${appId}|${appSecret}` }),
      getMeta(base, token, `/${officialWabaId}/subscribed_apps`),
      getMeta(base, token, `/${officialWabaId}/message_templates`, { fields: "name,language,status,category" }),
    ]);
    result.diagnostics.push(...[waba, phoneNumbers, debug, subscriptions, templates].map(diagnostic));
    result.OFFICIAL_WABA_ACCESS = waba.status === 200 && waba.body.id === officialWabaId;
    const phoneRows = Array.isArray(phoneNumbers.body.data) ? phoneNumbers.body.data : [];
    const officialPhone = phoneRows.find((item) => item && typeof item === "object" && digits((item as { display_phone_number?: unknown }).display_phone_number) === expectedDigits) as Record<string, unknown> | undefined;
    if (officialPhone && typeof officialPhone.id === "string") {
      result.OFFICIAL_PHONE_NUMBER_ID = officialPhone.id;
      result.OFFICIAL_PHONE_NUMBER_FOUND = true;
      result.CURRENT_CONNECTION_MODE = typeof officialPhone.platform === "string" ? officialPhone.platform : "UNKNOWN";
      result.COEXISTENCE_SAFE = result.CURRENT_CONNECTION_MODE.toUpperCase().includes("COEXIST") ? "YES" : "UNKNOWN";
      result.RISK_TO_CURRENT_WHATSAPP_APP = result.CURRENT_CONNECTION_MODE.toUpperCase().includes("CLOUD") ? "MEDIUM" : "HIGH";
      const detail = await getMeta(base, token, `/${officialPhone.id}`, { fields: "id,display_phone_number,status,verified_name,code_verification_status,quality_rating,platform" });
      result.diagnostics.push(diagnostic(detail));
    }
    const debugData = (debug.body.data ?? {}) as Record<string, unknown>;
    const scopes = Array.isArray(debugData.scopes) ? debugData.scopes.filter((value): value is string => typeof value === "string") : [];
    const granular = Array.isArray(debugData.granular_scopes) ? debugData.granular_scopes : [];
    result.SYSTEM_USER_ACCESS = result.OFFICIAL_WABA_ACCESS && debugData.is_valid === true && ["whatsapp_business_management", "whatsapp_business_messaging"].every((scope) => scopes.includes(scope) && granular.some((item) => {
      if (!item || typeof item !== "object" || (item as { scope?: unknown }).scope !== scope) return false;
      const targetIds = (item as { target_ids?: unknown }).target_ids;
      return !Array.isArray(targetIds) || targetIds.length === 0 || targetIds.includes(officialWabaId);
    }));
    const subscribed = Array.isArray(subscriptions.body.data) ? subscriptions.body.data : [];
    result.SUBSCRIBED_APPS = subscriptions.status === 200 && subscribed.some((item) => item && typeof item === "object" && (item as { whatsapp_business_api_data?: { id?: unknown } }).whatsapp_business_api_data?.id === appId);
    result.TEMPLATES = templates.status === 200;
  } catch {
    result.diagnostics.push({ endpoint: "audit", httpStatus: null, errorCode: "META_HEALTH_UNAVAILABLE", errorSubcode: null, errorType: null, errorMessage: "Meta audit unavailable" });
  }
  return result;
}
