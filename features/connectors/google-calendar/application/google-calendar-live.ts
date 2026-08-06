import type { GoogleWorkspaceConnection } from "@/features/connectors/google-workspace";
import type { GoogleCalendarLiveProvider } from "../provider/google-calendar-live.provider";
import type { GoogleCalendarSyncRepository } from "../repository/google-calendar-sync.repository";
import type {
  CalendarOperationalEventInput,
  CalendarOperationalEventType,
  GoogleCalendarEventColor,
  GoogleCalendarEventPayload,
  GoogleCalendarLiveResult,
  GoogleCalendarSyncOperation,
  GoogleCalendarSyncRecord,
} from "../types/google-calendar-live.types";

export const GOOGLE_CALENDAR_EVENT_COLORS: Readonly<Record<CalendarOperationalEventType, GoogleCalendarEventColor>> = {
  WEDDING: { eventType: "WEDDING", label: "Matrimonio", googleColorId: "5" },
  CORPORATE: { eventType: "CORPORATE", label: "Empresa", googleColorId: "9" },
  BIRTHDAY: { eventType: "BIRTHDAY", label: "Cumpleaños", googleColorId: "6" },
  GRADUATION: { eventType: "GRADUATION", label: "Graduación", googleColorId: "10" },
  INTERNAL: { eventType: "INTERNAL", label: "Interno", googleColorId: "8" },
};

export function generateOrbitEventId(eventDate: string, sequence: number): string {
  const year = eventDate.slice(0, 4);
  if (!/^\d{4}$/.test(year) || !Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new Error("Invalid ORBIT event identifier input");
  }
  return `ORB-${year}-${sequence.toString().padStart(6, "0")}`;
}

export function buildGoogleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function buildCalendarDescription(input: CalendarOperationalEventInput, orbitEventId: string): string {
  const operatorPaymentStatus = input.operatorPaymentStatus === "CONFIRMED" ? "Confirmado" : input.operatorPaymentStatus === "NOT_APPLICABLE" ? "No aplica" : "Pendiente";
  return [
    `Novios / Cliente: ${input.customerName}`,
    `Servicio: ${input.service}`,
    `Duración: ${input.contractedHours} horas`,
    `Hora de llamado del operador: ${input.operatorCallTime}`,
    `Horario de montaje: ${input.mountingWindow}`,
    `Inicio del servicio: ${input.serviceStart}`,
    `Fin del servicio: ${input.serviceEnd}`,
    `Horario de desmontaje: ${input.dismantlingWindow}`,
    `Dirección: ${input.customerAddress}`,
    `Google Maps: ${buildGoogleMapsLink(input.customerAddress)}`,
    `Contacto del evento: ${input.customerPhone} · ${input.customerEmail}`,
    `Black Box asignada: ${input.blackBox}`,
    `Cabina asignada: ${input.booth}`,
    `Vehículo asignado: ${input.assignedVehicle}`,
    `Extras: ${input.extras.join(", ") || "Sin extras"}`,
    ...(input.includeOperatorPaymentStatus ? [`Pago del operador: ${operatorPaymentStatus}`] : []),
    `ORBIT Event ID: ${orbitEventId}`,
    `Abrir ORBIT: ${input.orbitProjectUrl}`,
    `Operador: ${input.operator}`,
    `Notas operacionales: ${input.operationalNotes}`,
    `Portal ORBIT: ${input.portalUrl}`,
  ].join("\n");
}

export function mapOperationalEventToCalendar(input: CalendarOperationalEventInput): GoogleCalendarEventPayload {
  const orbitEventId = input.orbitEventId ?? generateOrbitEventId(input.eventDate, input.sequence);
  return {
    orbitEventId,
    title: `${GOOGLE_CALENDAR_EVENT_COLORS[input.eventType].label} | ${input.customerName}`,
    description: buildCalendarDescription(input, orbitEventId),
    date: input.eventDate,
    startTime: input.serviceStart,
    endTime: input.serviceEnd,
    location: input.customerAddress,
    googleMapsLink: buildGoogleMapsLink(input.customerAddress),
    portalUrl: input.portalUrl,
    color: GOOGLE_CALENDAR_EVENT_COLORS[input.eventType],
  };
}

function fingerprint(input: CalendarOperationalEventInput): string {
  return JSON.stringify(input);
}

function pendingRecord(input: CalendarOperationalEventInput): GoogleCalendarSyncRecord {
  return {
    orbitEventId: input.orbitEventId ?? generateOrbitEventId(input.eventDate, input.sequence),
    sourceEventId: input.eventId,
    planId: input.planId,
    status: "PENDING",
    sourceFingerprint: fingerprint(input),
  };
}

export class GoogleCalendarLive {
  constructor(
    private readonly workspace: GoogleWorkspaceConnection,
    private readonly provider: GoogleCalendarLiveProvider,
    private readonly repository: GoogleCalendarSyncRepository,
  ) {}

  async synchronize(
    input: CalendarOperationalEventInput,
    operation: GoogleCalendarSyncOperation = "UPSERT",
  ): Promise<GoogleCalendarLiveResult> {
    const baseRecord = pendingRecord(input);
    if (input.planStatus !== "APPROVED") {
      return { ok: false, record: baseRecord, error: { code: "PLAN_NOT_APPROVED", message: "Solo los planes aprobados pueden sincronizarse.", retryable: false } };
    }
    if (this.workspace.connectionStatus !== "CONNECTED" || this.workspace.health !== "HEALTHY") {
      return { ok: false, record: { ...baseRecord, status: "ERROR" }, error: { code: "WORKSPACE_UNAVAILABLE", message: "Google Workspace no está disponible.", retryable: true } };
    }
    if (!this.workspace.grantedServices.some(({ id, granted }) => id === "CALENDAR" && granted)) {
      return { ok: false, record: { ...baseRecord, status: "ERROR" }, error: { code: "CALENDAR_SCOPE_MISSING", message: "Google Calendar no fue concedido.", retryable: false } };
    }

    const existing = await this.repository.findByOrbitEventId(baseRecord.orbitEventId);
    const payload = mapOperationalEventToCalendar(input);
    try {
      if (operation === "CANCEL" || operation === "RESTORE") {
        if (!existing?.googleEventId) return { ok: false, record: baseRecord, error: { code: "EVENT_NOT_FOUND", message: "El evento sincronizado no existe.", retryable: false } };
        const reference = operation === "CANCEL"
          ? await this.provider.cancelEvent(existing.googleEventId)
          : await this.provider.restoreEvent(existing.googleEventId, payload);
        const record = await this.repository.save({ ...existing, status: operation === "CANCEL" ? "CANCELLED" : "SYNCHRONIZED", googleEventUrl: reference.googleEventUrl, sourceFingerprint: fingerprint(input), lastSynchronization: input.updatedAt, errorMessage: undefined });
        return { ok: true, record, operation: operation === "CANCEL" ? "CANCELLED" : "RESTORED" };
      }

      if (!existing?.googleEventId) {
        const reference = await this.provider.createEvent(payload);
        const record = await this.repository.save({ ...baseRecord, status: "SYNCHRONIZED", googleEventId: reference.googleEventId, googleEventUrl: reference.googleEventUrl, lastSynchronization: input.updatedAt });
        return { ok: true, record, operation: "CREATED" };
      }
      if (existing.sourceFingerprint === fingerprint(input) && existing.status === "SYNCHRONIZED") {
        return { ok: true, record: existing, operation: "UNCHANGED" };
      }
      const reference = await this.provider.updateEvent(existing.googleEventId, payload);
      const record = await this.repository.save({ ...existing, status: "SYNCHRONIZED", googleEventUrl: reference.googleEventUrl, sourceFingerprint: fingerprint(input), lastSynchronization: input.updatedAt, errorMessage: undefined });
      return { ok: true, record, operation: "UPDATED" };
    } catch {
      const record = await this.repository.save({ ...(existing ?? baseRecord), status: "ERROR", errorMessage: "Google Calendar no pudo completar la operación." });
      return { ok: false, record, error: { code: "PROVIDER_ERROR", message: record.errorMessage ?? "Error de proveedor.", retryable: true } };
    }
  }
}

export function getCommandCenterCalendarStatus(record: GoogleCalendarSyncRecord) {
  return record.status;
}

export function getOperationsBoardCalendarHealth(record: GoogleCalendarSyncRecord) {
  return record.status === "ERROR" ? "ERROR" : record.status === "UPDATE_REQUIRED" ? "ATTENTION_REQUIRED" : record.status === "SYNCHRONIZED" ? "HEALTHY" : "PENDING";
}
