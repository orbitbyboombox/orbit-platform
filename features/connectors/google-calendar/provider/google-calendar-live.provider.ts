import type {
  GoogleCalendarEventPayload,
  GoogleCalendarEventReference,
} from "../types/google-calendar-live.types";

export interface GoogleCalendarLiveProvider {
  createEvent(payload: GoogleCalendarEventPayload): Promise<GoogleCalendarEventReference>;
  updateEvent(googleEventId: string, payload: GoogleCalendarEventPayload): Promise<GoogleCalendarEventReference>;
  cancelEvent(googleEventId: string): Promise<GoogleCalendarEventReference>;
  restoreEvent(googleEventId: string, payload: GoogleCalendarEventPayload): Promise<GoogleCalendarEventReference>;
}

interface GoogleCalendarApiEvent { id: string; htmlLink: string; }

export class GoogleCalendarApiProvider implements GoogleCalendarLiveProvider {
  constructor(private readonly accessToken: string, private readonly calendarId = "primary") {}
  private endpoint(eventId?: string) { const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`; return eventId ? `${base}/${encodeURIComponent(eventId)}` : base; }
  private body(payload: GoogleCalendarEventPayload) { return { summary: payload.title, description: payload.description, location: payload.location, colorId: payload.color.googleColorId, start: { dateTime: `${payload.date}T${payload.startTime}:00`, timeZone: "America/Santiago" }, end: { dateTime: `${payload.endDate}T${payload.endTime}:00`, timeZone: "America/Santiago" }, extendedProperties: { private: { orbitEventId: payload.orbitEventId } } }; }
  private async request(url: string, init: RequestInit): Promise<GoogleCalendarApiEvent> { const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init.headers } }); if (!response.ok) throw new Error(`Google Calendar request failed (${response.status}): ${await response.text()}`); return response.json() as Promise<GoogleCalendarApiEvent>; }
  private reference(event: GoogleCalendarApiEvent) { return { googleEventId: event.id, googleEventUrl: event.htmlLink }; }
  async createEvent(payload: GoogleCalendarEventPayload) { return this.reference(await this.request(this.endpoint(), { method: "POST", body: JSON.stringify(this.body(payload)) })); }
  async updateEvent(id: string, payload: GoogleCalendarEventPayload) { return this.reference(await this.request(this.endpoint(id), { method: "PATCH", body: JSON.stringify(this.body(payload)) })); }
  async cancelEvent(id: string) { return this.reference(await this.request(this.endpoint(id), { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) })); }
  async restoreEvent(id: string, payload: GoogleCalendarEventPayload) { return this.updateEvent(id, payload); }
}
