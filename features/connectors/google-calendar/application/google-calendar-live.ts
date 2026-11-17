import type { GoogleWorkspaceConnection } from "@/features/connectors/google-workspace";
import { GoogleCalendarPreconditionFailed, type GoogleCalendarLiveProvider } from "../provider/google-calendar-live.provider";
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
import { hashCanonicalCalendarFingerprint } from "./canonical-calendar-fingerprint";
import { buildCalendarDescription, buildGoogleMapsLink } from "./google-calendar-description";
import { hasRemoteCalendarConflict } from "./calendar-sync-conflict";

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

export function mapOperationalEventToCalendar(input: CalendarOperationalEventInput): GoogleCalendarEventPayload {
  const orbitEventId = input.orbitEventId ?? generateOrbitEventId(input.eventDate, input.sequence);
  const start = `${input.calendarStartDate}T${input.calendarStartTime}`;
  const end = `${input.serviceEndDate ?? input.eventDate}T${input.serviceEnd}`;
  if (end <= start) {
    throw new Error("La ventana operacional de Calendar es inválida: el término debe ser posterior a la citación.");
  }
  return {
    orbitEventId,
    title: `${input.customerName} | ${input.service} | ${GOOGLE_CALENDAR_EVENT_COLORS[input.eventType].label}`,
    description: buildCalendarDescription(input, orbitEventId),
    date: input.calendarStartDate,
    startTime: input.calendarStartTime,
    endTime: input.serviceEnd,
    endDate: input.serviceEndDate ?? input.eventDate,
    location: input.customerAddress,
    googleMapsLink: buildGoogleMapsLink(input.customerAddress),
    portalUrl: input.portalUrl,
    color: GOOGLE_CALENDAR_EVENT_COLORS[input.eventType],
  };
}

function fingerprint(input: CalendarOperationalEventInput): string {
  const start = `${input.serviceStartDate}T${input.serviceStart}`;
  const end = `${input.serviceEndDate ?? input.eventDate}T${input.serviceEnd}`;
  const staffCall = input.operatorCallTime.includes("·") ? `${input.operatorCallTime.split("·")[0].trim()}T${input.operatorCallTime.split("·")[1].trim()}` : null;
  const payload = mapOperationalEventToCalendar(input);
  return hashCanonicalCalendarFingerprint({ orbitEventId: input.orbitEventId, serviceStartAt: start, serviceEndAt: end, staffCallAt: staffCall, staffCallSource: input.operatorCallTime ? "CANONICAL" : null, location: input.customerAddress, title: payload.title, description: payload.description });
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

function expectedCalendarStart(input: CalendarOperationalEventInput) {
  return `${input.calendarStartDate}T${input.calendarStartTime}`;
}

async function verifyRemoteStart(
  provider: GoogleCalendarLiveProvider,
  googleEventId: string,
  input: CalendarOperationalEventInput,
) {
  const remote = await provider.getEvent(googleEventId);
  const remoteDateTime = remote.start?.dateTime;
  const remoteEndDateTime = remote.end?.dateTime;
  const remoteTimeZone = remote.start?.timeZone;
  if (!remoteDateTime || !remoteEndDateTime || remoteTimeZone !== "America/Santiago") {
    throw new Error(`CALENDAR_REMOTE_VERIFY_FAILED: expected ${expectedCalendarStart(input)} America/Santiago, received ${remoteDateTime ?? "missing"} ${remoteTimeZone ?? "missing"}`);
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(remoteDateTime));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const actual = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  const endParts = formatter.formatToParts(new Date(remoteEndDateTime));
  const endValues = Object.fromEntries(endParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const actualEnd = `${endValues.year}-${endValues.month}-${endValues.day}T${endValues.hour}:${endValues.minute}`;
  const expectedEnd = `${input.serviceEndDate ?? input.eventDate}T${input.serviceEnd}`;
  if (actualEnd !== expectedEnd) {
    throw new Error(`CALENDAR_REMOTE_VERIFY_FAILED: expected end ${expectedEnd} America/Santiago, received ${actualEnd}`);
  }
  if (actual !== expectedCalendarStart(input)) {
    throw new Error(`CALENDAR_REMOTE_VERIFY_FAILED: expected ${expectedCalendarStart(input)} America/Santiago, received ${actual} ${remoteTimeZone}`);
  }
}

export class GoogleCalendarLive {
  constructor(
    private readonly workspace: GoogleWorkspaceConnection,
    private readonly provider: GoogleCalendarLiveProvider,
    private readonly repository: GoogleCalendarSyncRepository,
  ) {}

  private async prepareConditionalUpdate(existing: GoogleCalendarSyncRecord) {
    if (!existing.googleEventId) {
      return { ok: false as const, record: existing, error: { code: "EVENT_NOT_FOUND" as const, message: "El evento sincronizado no existe.", retryable: false } };
    }
    // This single read supplies the ETag for the atomic write. If the event changes
    // after this read, Google rejects PATCH with 412 and the write is not applied.
    const remote = await this.provider.getEvent(existing.googleEventId);
    if (!remote.etag || hasRemoteCalendarConflict(existing.lastSynchronization, remote.updated)) {
      const record = await this.repository.save({
        ...existing,
        status: "UPDATE_REQUIRED",
        errorCode: "REMOTE_EVENT_CHANGED",
        errorMessage: !remote.etag
          ? "Google Calendar no devolvió ETag; actualización detenida por seguridad."
          : "Google Calendar cambió después de la última sincronización ORBIT.",
      });
      return {
        ok: false as const,
        record,
        error: {
          code: "REMOTE_EVENT_CHANGED" as const,
          message: record.errorMessage ?? "El evento de Google Calendar requiere revisión antes de sincronizar.",
          retryable: false,
        },
      };
    }
    return { ok: true as const, remote };
  }

  async synchronize(
    input: CalendarOperationalEventInput,
    operation: GoogleCalendarSyncOperation = "UPSERT",
  ): Promise<GoogleCalendarLiveResult> {
    console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_RESOLVE", project_id: input.planId, requested_event_time: input.calendarStartTime, resolved_start_at: `${input.calendarStartDate}T${input.calendarStartTime}`, timezone: "America/Santiago" });
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
    console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_EXISTING_EVENT", project_id: input.planId, external_event_id: existing?.googleEventId ?? null });
    const payload = mapOperationalEventToCalendar(input);
    if (existing?.googleEventId && (!existing.calendarId || (this.provider.calendarId && existing.calendarId !== this.provider.calendarId))) {
      const record = await this.repository.save({ ...existing, status: "UPDATE_REQUIRED", errorCode: "CALENDAR_DESTINATION_UNVERIFIED", errorMessage: "Destino de Google Calendar ausente o distinto; sincronización detenida para evitar mover o duplicar eventos." });
      return { ok: false, record, error: { code: "CALENDAR_DESTINATION_UNVERIFIED", message: record.errorMessage ?? "Destino de Calendar requiere validación.", retryable: false } };
    }
    try {
      if (operation === "CANCEL" || operation === "RESTORE") {
        if (!existing?.googleEventId) return { ok: false, record: baseRecord, error: { code: "EVENT_NOT_FOUND", message: "El evento sincronizado no existe.", retryable: false } };
        const guard = await this.prepareConditionalUpdate(existing);
        if (!guard.ok) return guard;
        const reference = operation === "CANCEL"
          ? await this.provider.cancelEvent(existing.googleEventId, guard.remote.etag!)
          : await this.provider.restoreEvent(existing.googleEventId, payload, guard.remote.etag!);
        if (operation === "RESTORE") await verifyRemoteStart(this.provider, reference.googleEventId, input);
        const record = await this.repository.save({ ...existing, status: operation === "CANCEL" ? "CANCELLED" : "SYNCHRONIZED", googleEventUrl: reference.googleEventUrl, calendarId: this.provider.calendarId, sourceFingerprint: fingerprint(input), currentPayloadHash: fingerprint(input), lastSyncedPayloadHash: fingerprint(input), lastSynchronization: reference.updatedAt ?? new Date().toISOString(), errorMessage: undefined });
        return { ok: true, record, operation: operation === "CANCEL" ? "CANCELLED" : "RESTORED" };
      }

      if (!existing?.googleEventId) {
        console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_UPDATE", project_id: input.planId, external_event_id: null, requested_event_time: input.calendarStartTime });
        const reference = await this.provider.createEvent(payload);
        console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_VERIFY", project_id: input.planId, external_event_id: reference.googleEventId });
        await verifyRemoteStart(this.provider, reference.googleEventId, input);
        console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_PERSIST", project_id: input.planId, external_event_id: reference.googleEventId, status: "SYNCHRONIZED" });
        const record = await this.repository.save({ ...baseRecord, status: "SYNCHRONIZED", googleEventId: reference.googleEventId, googleEventUrl: reference.googleEventUrl, calendarId: this.provider.calendarId, lastSynchronization: reference.updatedAt ?? new Date().toISOString(), currentPayloadHash: fingerprint(input), lastSyncedPayloadHash: fingerprint(input) });
        return { ok: true, record, operation: "CREATED" };
      }
      if (existing.sourceFingerprint === fingerprint(input) && existing.status === "SYNCHRONIZED") {
        // A local fingerprint match does not prove the remote operational block is correct.
        // Verify Google Calendar before declaring this event unchanged.
        await verifyRemoteStart(this.provider, existing.googleEventId, input);
        const remote = await this.provider.getEvent(existing.googleEventId);
        if (remote.description !== payload.description || remote.summary !== payload.title) {
          // Only repair stale presentation when the remote event has not been edited
          // since ORBIT last synchronized it. Never overwrite a newer manual edit.
          const guard = await this.prepareConditionalUpdate(existing);
          if (!guard.ok) return guard;
          const reference = await this.provider.updateEvent(existing.googleEventId, payload, guard.remote.etag!);
          await verifyRemoteStart(this.provider, reference.googleEventId, input);
          const updatedFingerprint = fingerprint(input);
          const record = await this.repository.save({
            ...existing,
            status: "SYNCHRONIZED",
            googleEventUrl: reference.googleEventUrl,
            sourceFingerprint: updatedFingerprint,
            currentPayloadHash: updatedFingerprint,
            lastSyncedPayloadHash: updatedFingerprint,
            lastSynchronization: reference.updatedAt ?? new Date().toISOString(),
            errorCode: undefined,
            errorMessage: undefined,
          });
          return { ok: true, record, operation: "UPDATED" };
        }
        return { ok: true, record: existing, operation: "UNCHANGED" };
      }
      const guard = await this.prepareConditionalUpdate(existing);
      if (!guard.ok) return guard;
      console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_UPDATE", project_id: input.planId, external_event_id: existing.googleEventId, requested_event_time: input.calendarStartTime, etag_guarded: true });
      const reference = await this.provider.updateEvent(existing.googleEventId, payload, guard.remote.etag!);
      console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_VERIFY", project_id: input.planId, external_event_id: reference.googleEventId });
      await verifyRemoteStart(this.provider, reference.googleEventId, input);
      console.info("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_PERSIST", project_id: input.planId, external_event_id: reference.googleEventId, status: "SYNCHRONIZED" });
      const record = await this.repository.save({ ...existing, status: "SYNCHRONIZED", googleEventUrl: reference.googleEventUrl, sourceFingerprint: fingerprint(input), currentPayloadHash: fingerprint(input), lastSyncedPayloadHash: fingerprint(input), lastSynchronization: reference.updatedAt ?? new Date().toISOString(), errorMessage: undefined });
      return { ok: true, record, operation: "UPDATED" };
    } catch (error) {
      if (error instanceof GoogleCalendarPreconditionFailed) {
        const record = await this.repository.save({ ...(existing ?? baseRecord), status: "UPDATE_REQUIRED", errorCode: "REMOTE_EVENT_CHANGED", errorMessage: "Google Calendar rechazó el If-Match (HTTP 412); se conservó la edición remota y ORBIT requiere revisión." });
        return { ok: false, record, error: { code: "REMOTE_EVENT_CHANGED", message: record.errorMessage ?? "Conflicto ETag en Google Calendar.", retryable: false } };
      }
      console.error("[calendar-time-sync]", { stage: "CALENDAR_TIME_SYNC_VERIFY", project_id: input.planId, external_event_id: existing?.googleEventId ?? null, requested_event_time: input.calendarStartTime, resolved_start_at: `${input.calendarStartDate}T${input.calendarStartTime}`, timezone: "America/Santiago", code: error instanceof Error && error.message.startsWith("CALENDAR_REMOTE_VERIFY_FAILED") ? "CALENDAR_REMOTE_VERIFY_FAILED" : "PROVIDER_ERROR", message: error instanceof Error ? error.message : String(error) });
      const record = await this.repository.save({ ...(existing ?? baseRecord), status: "ERROR", errorMessage: "Google Calendar no pudo completar la operación." });
      return { ok: false, record, error: { code: "PROVIDER_ERROR", message: record.errorMessage ?? "Error de proveedor.", retryable: true } };
    }
  }
}

export function getCommandCenterCalendarStatus(record: GoogleCalendarSyncRecord) {
  return record.status;
}

export function getOperationsBoardCalendarHealth(record: GoogleCalendarSyncRecord) {
  if (record.currentPayloadHash && record.lastSyncedPayloadHash && record.currentPayloadHash !== record.lastSyncedPayloadHash) return "ATTENTION_REQUIRED";
  return record.status === "ERROR" || record.status === "FAILED" ? "ERROR" : record.status === "UPDATE_REQUIRED" || record.status === "STALE" ? "ATTENTION_REQUIRED" : record.status === "SYNCHRONIZED" ? "HEALTHY" : "PENDING";
}

export function getCalendarSyncLabel(record: GoogleCalendarSyncRecord): string {
  if (record.currentPayloadHash && record.lastSyncedPayloadHash && record.currentPayloadHash !== record.lastSyncedPayloadHash) return "Cambios pendientes de sincronizar con Google Calendar";
  if (record.status === "SYNCING") return "Actualizando Google Calendar";
  if (record.status === "FAILED" || record.status === "ERROR") return "Error de sincronización";
  if (record.status === "STALE" || record.status === "PENDING" || record.status === "UPDATE_REQUIRED") return "Cambios pendientes de sincronizar con Google Calendar";
  return "Sincronizado";
}
