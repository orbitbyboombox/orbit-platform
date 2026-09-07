export type ProgressiveAvailabilityState = "MISSING_DATE" | "MISSING_TIME" | "PRELIMINARY" | "MISSING_LOCATION" | "MISSING_SERVICE" | "VALIDATING" | "AVAILABLE" | "UNAVAILABLE" | "REVIEW_REQUIRED";

export function progressiveAvailabilityState(input: { date?: string; time?: string; location?: string; service?: boolean; loading?: boolean; result?: "AVAILABLE" | "UNAVAILABLE" | "REVIEW_REQUIRED" | null }): ProgressiveAvailabilityState {
  if (!input.date) return "MISSING_DATE";
  if (!input.time) return "MISSING_TIME";
  if (!input.location?.trim()) return "PRELIMINARY";
  if (!input.service) return "MISSING_SERVICE";
  if (input.loading) return "VALIDATING";
  return input.result ?? "REVIEW_REQUIRED";
}

export function progressiveAvailabilityMessage(state: ProgressiveAvailabilityState) {
  return ({ MISSING_DATE: "Selecciona la fecha del evento.", MISSING_TIME: "Selecciona el horario para validar disponibilidad.", PRELIMINARY: "Horario preliminarmente disponible. Completa la ubicación y el servicio para confirmar disponibilidad.", MISSING_LOCATION: "Completa la ubicación para seguir validando.", MISSING_SERVICE: "Selecciona un servicio para completar la validación.", VALIDATING: "Validando disponibilidad…", AVAILABLE: "Disponible.", UNAVAILABLE: "Sin disponibilidad.", REVIEW_REQUIRED: "Requiere revisión." } as const)[state];
}
