export type StaffPublicationReadinessInput = {
  eventDate?: string | null;
  location?: string | null;
  eventAddress?: string | null;
  city?: string | null;
  customerName?: string | null;
  services: readonly { serviceCode?: string | null; durationHours?: number | null }[];
};

const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function resolveStaffPublicationReadiness(input: StaffPublicationReadinessInput) {
  const location = present(input.eventAddress) ? input.eventAddress!.trim() : present(input.location) ? input.location!.trim() : "";
  const missing: string[] = [];
  if (!present(input.eventDate)) missing.push("fecha");
  if (!location) missing.push("ubicación");
  if (!present(input.city)) missing.push("ciudad");
  if (!present(input.customerName)) missing.push("cliente");
  if (!input.services.some((service) => present(service.serviceCode) && Number(service.durationHours) > 0)) missing.push("servicio y duración");
  return { ok: missing.length === 0, location, missing };
}
