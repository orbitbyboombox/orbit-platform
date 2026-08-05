export type CalendarSyncStatus =
  | "NOT_SYNCED"
  | "PENDING"
  | "SYNCED"
  | "FAILED"
  | "RETRY_AVAILABLE";

export interface CalendarSyncRecord {
  syncRequestId: string;
  projectId: string;
  operationId: string;
  provider: "GOOGLE_CALENDAR";
  status: CalendarSyncStatus;
  externalEventId: string | null;
  externalEventUrl: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

export interface GoogleCalendarEventReference {
  eventId: string;
  eventUrl: string;
}

export type GoogleCalendarAdapterErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INVALID_SYNC_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "EVENT_CREATION_FAILED"
  | "EVENT_UPDATE_FAILED";

export interface GoogleCalendarAdapterError {
  code: GoogleCalendarAdapterErrorCode;
  message: string;
  retryable: boolean;
}

export type GoogleCalendarAdapterResult =
  | { success: true; event: GoogleCalendarEventReference }
  | { success: false; error: GoogleCalendarAdapterError };
