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
