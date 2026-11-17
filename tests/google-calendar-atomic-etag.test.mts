import test from "node:test";
import assert from "node:assert/strict";
import { GoogleCalendarApiProvider, GoogleCalendarPreconditionFailed } from "../features/connectors/google-calendar/provider/google-calendar-live.provider.ts";
import type { GoogleCalendarEventPayload } from "../features/connectors/google-calendar/types/google-calendar-live.types.ts";

const payload: GoogleCalendarEventPayload = {
  orbitEventId: "ORB-2026-145073",
  title: "Catalina Sanhueza | CLASSIC | Empresa",
  description: "CITACIÓN OPERADORES BOOMBOX",
  date: "2026-11-20",
  startTime: "23:00",
  endDate: "2026-11-21",
  endTime: "03:00",
  location: "Av. Alcalde Fernando Castillo Velasco 11095",
  googleMapsLink: "https://maps.google.com",
  portalUrl: "https://app.bbox.cl",
  color: { eventType: "CORPORATE", label: "Empresa", googleColorId: "9" },
};

test("Calendar PATCH sends If-Match from the single pre-write read", async () => {
  const previousFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ id: "existing-id", htmlLink: "https://calendar.google.com/event", updated: "2026-11-17T10:00:00Z" }), { status: 200 });
  }) as typeof fetch;
  try {
    const provider = new GoogleCalendarApiProvider("token", "calendar-id");
    const result = await provider.updateEvent("existing-id", payload, '"etag-v1"');
    assert.equal(result.googleEventId, "existing-id");
    assert.equal(new Headers(captured?.headers).get("If-Match"), '"etag-v1"');
    assert.equal(captured?.method, "PATCH");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Calendar 412 is surfaced as a non-retryable concurrent edit conflict", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 412 })) as typeof fetch;
  try {
    const provider = new GoogleCalendarApiProvider("token", "calendar-id");
    await assert.rejects(provider.updateEvent("existing-id", payload, '"stale-etag"'), GoogleCalendarPreconditionFailed);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Calendar updates fail closed without an ETag", async () => {
  const provider = new GoogleCalendarApiProvider("token", "calendar-id");
  await assert.rejects(provider.updateEvent("existing-id", payload, ""), /requires an ETag/);
});
