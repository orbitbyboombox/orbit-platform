const ACTIVE_OPPORTUNITY_FIELDS = [
  "activeOpportunityId",
  "eventType",
  "eventName",
  "eventDate",
  "alternateDate",
  "startTime",
  "endTime",
  "durationHours",
  "commune",
  "address",
  "venue",
  "city",
  "region",
  "attendees",
  "estimatedServiceUsers",
  "indoorOutdoor",
  "requestedService",
  "secondaryServices",
  "specialRequirements",
  "eventLocation",
  "selectedService",
  "selectedServices",
  "recommendedHours",
  "currentTimelineStage",
  "quotationStatus",
  "reservationStatus",
  "paymentStatus",
  "portalStatus",
  "whatsappAi",
] as const;

const NEW_COMMERCIAL_INTENT = /\b(?:quiero|necesito|me\s+gustar[ií]a)\s+(?:cotizar|una\s+cotizaci[oó]n|ver\s+opciones)\b|\bquiero\s+ver\s+opciones\b/i;
const EXPLICIT_CONTINUATION = /\b(?:sobre\s+(?:el|la|lo|lo\s+que)|sigamos\s+con|continuemos\s+con|el\s+mismo|la\s+misma|lo\s+que\s+(?:vimos|cotizamos)|quiero\s+reservar\s+(?:lo|el|la))\b/i;

export function isExplicitBiancaContinuation(text: string) {
  return EXPLICIT_CONTINUATION.test(text.trim());
}

export function isNewBiancaCommercialOpportunity(text: string) {
  const normalized = text.trim();
  return NEW_COMMERCIAL_INTENT.test(normalized) && !isExplicitBiancaContinuation(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Archives the previous active opportunity without deleting customer memory.
 * The returned context contains only identity plus a clean opportunity shell.
 */
export function resetBiancaActiveContext(context: Record<string, unknown>, occurredAt: string) {
  const snapshot = Object.fromEntries(
    ACTIVE_OPPORTUNITY_FIELDS
      .filter((field) => context[field] !== undefined)
      .map((field) => [field, context[field]]),
  );
  const priorHistory = Array.isArray(context.historicalOpportunities)
    ? context.historicalOpportunities.filter(isRecord)
    : [];
  const historicalOpportunities = Object.keys(snapshot).length
    ? [...priorHistory, { ...snapshot, archivedAt: occurredAt }].slice(-20)
    : priorHistory;
  const next: Record<string, unknown> = { ...context, historicalOpportunities };
  for (const field of ACTIVE_OPPORTUNITY_FIELDS) delete next[field];

  const confirmedFields = Array.isArray(context.confirmedFields)
    ? context.confirmedFields.filter((field) => field === "customerName")
    : [];
  if (confirmedFields.length) next.confirmedFields = confirmedFields;
  else {
    delete next.confirmedFields;
    delete next.customerName;
    delete next.nameSource;
  }
  if (context.preferredNameConfirmed !== true || typeof context.preferredName !== "string" || !context.preferredName.trim()) {
    delete next.preferredName;
    delete next.preferredNameConfirmed;
  }
  next.quotationStatus = "NOT_STARTED";
  next.reservationStatus = "NOT_STARTED";
  next.paymentStatus = "NOT_STARTED";
  next.portalStatus = "NOT_CREATED";
  next.activeOpportunityId = crypto.randomUUID();
  return next;
}

export function prepareBiancaOpportunityContext(context: Record<string, unknown>, messageText: string, occurredAt: string) {
  if (!isNewBiancaCommercialOpportunity(messageText)) {
    if (typeof context.activeOpportunityId === "string" && context.activeOpportunityId.trim()) return { context, reset: false as const };
    return { context: { ...context, activeOpportunityId: crypto.randomUUID() }, reset: false as const };
  }
  return { context: resetBiancaActiveContext(context, occurredAt), reset: true as const };
}
