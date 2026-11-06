export type StaffVenueInfo = {
  name: string;
  reference: string;
  accessInstructions: string;
  parking: string;
  observations: string;
};

type VenueOperations = Record<string, unknown> | null | undefined;
type VenueContract = {
  access_instructions?: string | null;
  parking_status?: string | null;
  operational_notes?: string | null;
  logistics_reason?: string | null;
  loading_access?: string | null;
  logistics_notes?: string | null;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function resolveStaffVenueInfo(input: {
  operations: VenueOperations;
  location?: string | null;
  contract?: VenueContract | null;
}): StaffVenueInfo {
  const operations = input.operations ?? {};
  const contract = input.contract ?? {};
  const observations = [
    text(contract.operational_notes),
    text(contract.logistics_notes),
  ].filter(Boolean).join(" · ");

  return {
    name: text(operations.venue) || text(operations.venueName) || text(input.location) || "Recinto pendiente de confirmar",
    reference: text(operations.venueReference) || text(operations.venueReferences),
    accessInstructions: text(contract.access_instructions) || text(contract.loading_access),
    parking: text(contract.parking_status),
    observations,
  };
}

/** Address is distinct from venue. Legacy reservations stored it in a labeled notes line. */
export function resolveStaffEventAddress(input: {
  operations: VenueOperations;
}): string {
  const operations = input.operations ?? {};
  const canonical = text(operations.eventAddress) || text(operations.event_address);
  if (canonical) return canonical;
  const notes = text(operations.notes);
  const legacy = notes.match(/(?:^|\n)\s*Direcci[oó]n\s+(?:del\s+)?evento\s*:\s*([^\r\n]+)/i);
  return legacy?.[1]?.trim() || "Dirección por confirmar";
}
