export type CalendarOperationalPlanStatus = "DRAFT" | "APPROVED";
export type CalendarOperationalEventType = "WEDDING" | "CORPORATE" | "BIRTHDAY" | "GRADUATION" | "INTERNAL";
export type GoogleCalendarSyncStatus = "PENDING" | "SYNCHRONIZED" | "UPDATE_REQUIRED" | "ERROR" | "CANCELLED" | "DELETED";
export type GoogleCalendarSyncOperation = "UPSERT" | "CANCEL" | "RESTORE";
export type OperatorPaymentOperationalStatus = "PENDING" | "CONFIRMED" | "NOT_APPLICABLE";

export interface CalendarOperationalEventInput {
  orbitEventId?: string;
  planId: string;
  planStatus: CalendarOperationalPlanStatus;
  sequence: number;
  eventId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  eventType: CalendarOperationalEventType;
  service: string;
  contractedHours: number;
  eventDate: string;
  calendarStartDate: string;
  calendarStartTime: string;
  operator: string;
  blackBox: string;
  booth: string;
  assignedVehicle: string;
  operatorCallTime: string;
  mountingWindow: string;
  serviceStart: string;
  serviceStartDate: string;
  serviceEnd: string;
  serviceEndDate?: string;
  dismantlingWindow: string;
  operationalNotes: string;
  extras: readonly string[];
  includeOperatorPaymentStatus?: boolean;
  operatorPaymentStatus?: OperatorPaymentOperationalStatus;
  customerAddress: string;
  venue?: string;
  municipality?: string;
  operationalContact?: string;
  assignedStaff?: readonly string[];
  commercialNotes?: string;
  portalUrl: string;
  orbitProjectUrl: string;
  updatedAt: string;
}

export interface GoogleCalendarEventColor {
  eventType: CalendarOperationalEventType;
  label: string;
  googleColorId: string;
}

export interface GoogleCalendarEventPayload {
  orbitEventId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string;
  location: string;
  googleMapsLink: string;
  portalUrl: string;
  color: GoogleCalendarEventColor;
}

export interface GoogleCalendarEventReference {
  googleEventId: string;
  googleEventUrl: string;
}

export interface GoogleCalendarSyncRecord {
  orbitEventId: string;
  sourceEventId: string;
  planId: string;
  status: GoogleCalendarSyncStatus;
  googleEventId?: string;
  googleEventUrl?: string;
  sourceFingerprint: string;
  lastSynchronization?: string;
  errorMessage?: string;
}

export type GoogleCalendarLiveErrorCode = "PLAN_NOT_APPROVED" | "WORKSPACE_UNAVAILABLE" | "CALENDAR_SCOPE_MISSING" | "EVENT_NOT_FOUND" | "PROVIDER_ERROR";

export interface GoogleCalendarLiveError {
  code: GoogleCalendarLiveErrorCode;
  message: string;
  retryable: boolean;
}

export type GoogleCalendarLiveResult =
  | { ok: true; record: GoogleCalendarSyncRecord; operation: "CREATED" | "UPDATED" | "UNCHANGED" | "CANCELLED" | "RESTORED" }
  | { ok: false; record: GoogleCalendarSyncRecord; error: GoogleCalendarLiveError };
