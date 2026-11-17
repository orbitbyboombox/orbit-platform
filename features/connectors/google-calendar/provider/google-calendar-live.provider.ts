import type {
  GoogleCalendarEventPayload,
  GoogleCalendarEventReference,
} from "../types/google-calendar-live.types";

export interface GoogleCalendarLiveProvider {
  readonly calendarId?: string;
  getEvent(googleEventId: string): Promise<GoogleCalendarRemoteEvent>;
  createEvent(payload: GoogleCalendarEventPayload): Promise<GoogleCalendarEventReference>;
  updateEvent(googleEventId: string, payload: GoogleCalendarEventPayload, etag: string): Promise<GoogleCalendarEventReference>;
  cancelEvent(googleEventId: string, etag: string): Promise<GoogleCalendarEventReference>;
  deleteEvent(googleEventId: string): Promise<void>;
  restoreEvent(googleEventId: string, payload: GoogleCalendarEventPayload, etag: string): Promise<GoogleCalendarEventReference>;
}

export interface GoogleCalendarRemoteEvent {
  id: string;
  htmlLink: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string }; end?: { dateTime?: string; date?: string; timeZone?: string }; updated?: string; etag?: string;
}

export class GoogleCalendarPreconditionFailed extends Error {
  constructor() { super("Google Calendar event changed after it was read (HTTP 412)."); this.name = "GoogleCalendarPreconditionFailed"; }
}

export class GoogleCalendarApiProvider implements GoogleCalendarLiveProvider {
  constructor(private readonly accessToken: string, readonly calendarId = "primary") {}
  private endpoint(eventId?: string) { const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`; return eventId ? `${base}/${encodeURIComponent(eventId)}` : base; }
  private body(payload: GoogleCalendarEventPayload) { return { summary: payload.title, description: payload.description, location: payload.location, colorId: payload.color.googleColorId, start: { dateTime: `${payload.date}T${payload.startTime}:00`, timeZone: "America/Santiago" }, end: { dateTime: `${payload.endDate}T${payload.endTime}:00`, timeZone: "America/Santiago" }, extendedProperties: { private: { orbitEventId: payload.orbitEventId } } }; }
  private async request(url: string, init: RequestInit): Promise<GoogleCalendarRemoteEvent> { const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init.headers } }); if (response.status === 412) throw new GoogleCalendarPreconditionFailed(); if (!response.ok) throw new Error(`Google Calendar request failed (${response.status}): ${await response.text()}`); return response.json() as Promise<GoogleCalendarRemoteEvent>; }
  private reference(event: GoogleCalendarRemoteEvent) { return { googleEventId: event.id, googleEventUrl: event.htmlLink, updatedAt: event.updated }; }
  async getEvent(id: string) { return this.request(this.endpoint(id), { method: "GET" }); }
  async createEvent(payload: GoogleCalendarEventPayload) { return this.reference(await this.request(this.endpoint(), { method: "POST", body: JSON.stringify(this.body(payload)) })); }
  async updateEvent(id: string, payload: GoogleCalendarEventPayload, etag: string) { if (!etag) throw new Error("Calendar update requires an ETag"); return this.reference(await this.request(this.endpoint(id), { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(this.body(payload)) })); }
  async cancelEvent(id: string, etag: string) { if (!etag) throw new Error("Calendar update requires an ETag"); return this.reference(await this.request(this.endpoint(id), { method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify({ status: "cancelled" }) })); }
  async deleteEvent(id: string) {
    const response = await fetch(this.endpoint(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    // Cleanup is intentionally idempotent: a resource already gone from
    // Google (404/410) is the desired terminal state, not a retry failure.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`Google Calendar delete failed (${response.status}): ${await response.text()}`);
    }
  }
  async restoreEvent(id: string, payload: GoogleCalendarEventPayload, etag: string) { return this.updateEvent(id, payload, etag); }
}
