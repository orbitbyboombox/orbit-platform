import type {
  GoogleCalendarEventPayload,
  GoogleCalendarEventReference,
} from "../types/google-calendar-live.types";

export interface GoogleCalendarLiveProvider {
  readonly calendarId?: string;
  getEvent(googleEventId: string): Promise<GoogleCalendarRemoteEvent>;
  findEventsByOrbitEventId?(orbitEventId: string): Promise<GoogleCalendarRemoteEvent[]>;
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
  start?: { dateTime?: string; date?: string; timeZone?: string }; end?: { dateTime?: string; date?: string; timeZone?: string }; updated?: string; etag?: string; location?: string; status?: string; extendedProperties?: { private?: Record<string, string> };
}

export class GoogleCalendarPreconditionFailed extends Error {
  constructor() { super("Google Calendar event changed after it was read (HTTP 412)."); this.name = "GoogleCalendarPreconditionFailed"; }
}

export class GoogleCalendarApiProvider implements GoogleCalendarLiveProvider {
  private static readonly requestTimeoutMs = 15_000;
  private readonly accessToken: string;
  readonly calendarId: string;
  constructor(accessToken: string, calendarId = "primary") { this.accessToken = accessToken; this.calendarId = calendarId; }
  private endpoint(eventId?: string) { const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`; return eventId ? `${base}/${encodeURIComponent(eventId)}` : base; }
  private body(payload: GoogleCalendarEventPayload) { return { summary: payload.title, description: payload.description, location: payload.location, colorId: payload.color.googleColorId, start: { dateTime: `${payload.date}T${payload.startTime}:00`, timeZone: "America/Santiago" }, end: { dateTime: `${payload.endDate}T${payload.endTime}:00`, timeZone: "America/Santiago" }, extendedProperties: { private: { orbitEventId: payload.orbitEventId } } }; }
  private async request(url: string, init: RequestInit): Promise<GoogleCalendarRemoteEvent> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(GoogleCalendarApiProvider.requestTimeoutMs), headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init.headers } });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new Error("Google Calendar no respondió dentro de 15 segundos; no se persistió ningún cambio.");
      throw error;
    }
    if (response.status === 412) throw new GoogleCalendarPreconditionFailed();
    if (!response.ok) throw new Error(`Google Calendar request failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleCalendarRemoteEvent>;
  }
  private reference(event: GoogleCalendarRemoteEvent) { return { googleEventId: event.id, googleEventUrl: event.htmlLink, updatedAt: event.updated }; }
  async getEvent(id: string) { return this.request(this.endpoint(id), { method: "GET" }); }
  async findEventsByOrbitEventId(orbitEventId: string) {
    const matches: GoogleCalendarRemoteEvent[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(this.endpoint());
      url.searchParams.set("q", orbitEventId);
      url.searchParams.set("maxResults", "2500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { signal: AbortSignal.timeout(GoogleCalendarApiProvider.requestTimeoutMs), headers: { Authorization: `Bearer ${this.accessToken}` } });
      if (!response.ok) throw new Error(`Google Calendar duplicate check failed (${response.status}): ${await response.text()}`);
      const body = await response.json() as { items?: GoogleCalendarRemoteEvent[]; nextPageToken?: string };
      matches.push(...(body.items ?? []).filter((event) => event.status !== "cancelled" && (event.extendedProperties?.private?.orbitEventId === orbitEventId || event.description?.split("\n").some((line) => line.trim() === `ORBIT Event ID: ${orbitEventId}`))));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return matches;
  }
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
