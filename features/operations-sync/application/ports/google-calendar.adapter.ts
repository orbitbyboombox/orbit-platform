import type {
  GoogleCalendarAdapterResult,
  SyncRequest,
} from "../../types";

export interface GoogleCalendarAdapter {
  createEvent(request: SyncRequest): Promise<GoogleCalendarAdapterResult>;
  updateEvent(
    eventId: string,
    request: SyncRequest,
  ): Promise<GoogleCalendarAdapterResult>;
}
