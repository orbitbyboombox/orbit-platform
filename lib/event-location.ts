const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Legacy reservations may carry an address in an older field or a labeled note. */
export function resolveEventAddress(operations: Record<string, unknown> | null | undefined): string {
  if (typeof operations?.eventAddress === "string") return operations.eventAddress.trim();
  const notes = text(operations?.notes).replaceAll("\\n", "\n");
  return text(operations?.event_address)
    || notes.match(/(?:^|\n)[ \t]*Direcci[oó]n[ \t]+(?:del[ \t]+)?evento[ \t]*:[ \t]*([^\r\n]+)/i)?.[1]?.trim()
    || "";
}

export function buildEventMapsUrl(
  address: string,
  commune?: string | null,
  venue?: string | null,
): string | undefined {
  const street = text(address);
  if (!street || /(?:por confirmar|pendiente de (?:confirmar|registrar))$/i.test(street)) return undefined;
  const query = [...new Set([street, text(commune), text(venue), "Chile"].filter(Boolean))].join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
