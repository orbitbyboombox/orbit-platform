import type { CalendarOperationalEventInput, GoogleCalendarSyncRecord } from "../types/google-calendar-live.types";
import { generateOrbitEventId } from "./google-calendar-live";

export const MOCK_APPROVED_CALENDAR_EVENT: CalendarOperationalEventInput = {
  planId: "plan-2027-09-14",
  planStatus: "APPROVED",
  sequence: 184,
  eventId: "maria-felipe-operation",
  customerName: "María González + Felipe Soto",
  customerPhone: "+56 9 6123 4587",
  customerEmail: "maria.felipe@example.com",
  eventType: "WEDDING",
  service: "BBOX360",
  contractedHours: 4,
  eventDate: "2027-09-14",
  operator: "Antonia Silva",
  blackBox: "Black Box 05",
  booth: "Cabina BBOX360 01",
  assignedVehicle: "CHANGAN MD201",
  operatorCallTime: "18:00",
  mountingWindow: "18:15–19:00",
  serviceStart: "19:00",
  serviceEnd: "23:00",
  dismantlingWindow: "23:00–23:30",
  operationalNotes: "Confirmar acceso de carga con producción antes de la salida.",
  extras: ["QR", "Libro de firmas"],
  includeOperatorPaymentStatus: true,
  operatorPaymentStatus: "PENDING",
  customerAddress: "CasaPiedra, Av. San Josemaría Escrivá de Balaguer 5600, Vitacura",
  portalUrl: "https://orbit.boom-box.cl/p/BBX-27-000184",
  orbitProjectUrl: "https://orbit.boom-box.cl/projects/maria-felipe-operation",
  updatedAt: "5 agosto 2026 · 17:15",
};

export const MOCK_GOOGLE_CALENDAR_SYNC_RECORD: GoogleCalendarSyncRecord = {
  orbitEventId: generateOrbitEventId(MOCK_APPROVED_CALENDAR_EVENT.eventDate, MOCK_APPROVED_CALENDAR_EVENT.sequence),
  sourceEventId: MOCK_APPROVED_CALENDAR_EVENT.eventId,
  planId: MOCK_APPROVED_CALENDAR_EVENT.planId,
  status: "SYNCHRONIZED",
  googleEventId: "gcal-orb-2027-000184",
  googleEventUrl: "https://calendar.google.com/calendar/event?eid=gcal-orb-2027-000184",
  sourceFingerprint: JSON.stringify(MOCK_APPROVED_CALENDAR_EVENT),
  lastSynchronization: MOCK_APPROVED_CALENDAR_EVENT.updatedAt,
};
