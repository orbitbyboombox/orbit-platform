export function readEventAddress(operations?: Record<string, unknown> | null): string {
  if (typeof operations?.eventAddress === "string") return operations.eventAddress.trim();
  if (typeof operations?.event_address === "string") return operations.event_address.trim();
  const notes = typeof operations?.notes === "string" ? operations.notes : "";
  return notes.replaceAll("\\n", "\n").match(/^[ \t]*Direcci[oó]n[ \t]+(?:del[ \t]+)?evento[ \t]*:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
}

export function eventLocationQuery(address: string, commune?: string | null, venue?: string | null): string {
  if (!address.trim() || /^(?:dirección )?(?:pendiente|por confirmar)(?: de confirmar)?$/i.test(address.trim())) return "";
  const parts = [address, commune, venue].map((part) => part?.trim()).filter(Boolean);
  return [...new Set(parts)].join(", ");
}

export function eventMapsUrl(address: string, commune?: string | null, venue?: string | null): string {
  const query = eventLocationQuery(address, commune, venue);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

/** Older commercial drafts used the location field for the street address. */
export function readQuoteLocation(event: Record<string, unknown>) {
  const location = typeof event.location === "string" ? event.location.trim() : "";
  return typeof event.address === "string"
    ? { venue: location, address: event.address.trim() }
    : { venue: "", address: location };
}
