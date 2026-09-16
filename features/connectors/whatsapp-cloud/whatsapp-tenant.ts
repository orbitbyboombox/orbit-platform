export const WHATSAPP_TENANT_SLUG = "boombox" as const;

export function normalizeWhatsAppTenant(value: string | undefined) {
  return value?.trim().toLowerCase() || WHATSAPP_TENANT_SLUG;
}

export function whatsappTenantMatches(value: string | undefined) {
  return normalizeWhatsAppTenant(value) === WHATSAPP_TENANT_SLUG;
}
