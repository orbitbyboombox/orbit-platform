import test from "node:test";
import assert from "node:assert/strict";
import { verifyApprovedRemoteEvent, fingerprintReviewedCalendarEvent, isApprovedRemoteBaselineCurrent } from "../features/connectors/google-calendar/application/calendar-remote-review-policy.ts";
import type { CalendarOperationalEventInput, GoogleCalendarEventPayload } from "../features/connectors/google-calendar/types/google-calendar-live.types.ts";
import type { GoogleCalendarRemoteEvent } from "../features/connectors/google-calendar/provider/google-calendar-live.provider.ts";
import { GoogleCalendarApiProvider } from "../features/connectors/google-calendar/provider/google-calendar-live.provider.ts";
import { buildCalendarDescription, buildGoogleMapsLink } from "../features/connectors/google-calendar/application/google-calendar-description.ts";

const input: CalendarOperationalEventInput = {
  orbitEventId: "ORB-2027-919683", planId: "project", planStatus: "APPROVED", sequence: 1, eventId: "project",
  customerName: "Maria José Arancibia", customerPhone: "56982395937", customerEmail: "maria@example.test",
  eventType: "WEDDING", service: "BLACK_STUDIO", contractedHours: 3, eventDate: "2027-01-16",
  calendarStartDate: "2027-01-15", calendarStartTime: "22:30", operator: "Pendiente", blackBox: "Pendiente", booth: "Pendiente",
  assignedVehicle: "Pendiente", operatorCallTime: "2027-01-15 · 22:30", mountingWindow: "45 minutos",
  serviceStart: "23:30", serviceStartDate: "2027-01-15", serviceEnd: "02:30", serviceEndDate: "2027-01-16",
  dismantlingWindow: "30 minutos", operationalNotes: "Sin notas", extras: ["QR", "Imanes"], customerAddress: "Ruta 5 Norte Km 30",
  venue: "Chile", municipality: "Colina", operationalContact: "Por confirmar", portalUrl: "https://app.bbox.cl/projects/project",
  orbitProjectUrl: "https://app.bbox.cl/projects/project", updatedAt: "2026-11-17T12:00:00.000Z",
};
const expected: GoogleCalendarEventPayload = {
  orbitEventId: input.orbitEventId!, title: "Maria Jose Arancibia | BLACK_STUDIO | Matrimonio",
  description: buildCalendarDescription(input, input.orbitEventId!),
  date: "2027-01-15", startTime: "22:30", endDate: "2027-01-16", endTime: "02:30", location: input.customerAddress,
  googleMapsLink: buildGoogleMapsLink(input.customerAddress), portalUrl: input.portalUrl,
  color: { eventType: "WEDDING", label: "Matrimonio", googleColorId: "5" },
};
const remote: GoogleCalendarRemoteEvent = {
  id: "calendar-event", htmlLink: "https://calendar.google.com/event", summary: expected.title,
  description: expected.description.replace("22:30.", "22:30 (1 hora antes del servicio)."), location: expected.location,
  status: "confirmed", etag: '"etag-1"', updated: "2026-11-16T14:00:00.000Z",
  start: { dateTime: "2027-01-16T01:30:00Z", timeZone: "America/Santiago" },
  end: { dateTime: "2027-01-16T05:30:00Z", timeZone: "America/Santiago" },
};

test("reconciliation accepts the same approved cross-midnight window and citation without writing Calendar", () => {
  const verified = verifyApprovedRemoteEvent(input, expected, remote);
  assert.deepEqual(verified.start, { date: "2027-01-15", time: "22:30" });
  assert.deepEqual(verified.end, { date: "2027-01-16", time: "02:30" });
  assert.equal(verified.remoteHash, fingerprintReviewedCalendarEvent(input, remote));
});

test("reconciliation fails closed for stale/missing ETags, identity, time, description, and cancellation", () => {
  for (const changed of [
    { ...remote, etag: undefined },
    { ...remote, summary: "Another client | CLASSIC | Matrimonio" },
    { ...remote, end: { dateTime: "2027-01-16T06:30:00Z", timeZone: "America/Santiago" } },
    { ...remote, description: `${remote.description}\nA newer unreviewed note` },
    { ...remote, status: "cancelled" },
  ]) assert.throws(() => verifyApprovedRemoteEvent(input, expected, changed));
});

test("a changed remote payload produces a different official fingerprint", () => {
  assert.notEqual(fingerprintReviewedCalendarEvent(input, remote), fingerprintReviewedCalendarEvent(input, { ...remote, description: `${remote.description}\nnota` }));
});

test("an accepted snapshot is idempotent only while source, remote hash, and ETag stay unchanged", () => {
  const sourceHash = "source-hash";
  const remoteHash = fingerprintReviewedCalendarEvent(input, remote);
  const record = { approvedRemoteSourceHash: sourceHash, currentPayloadHash: sourceHash, approvedRemotePayloadHash: remoteHash, lastSyncedPayloadHash: remoteHash, approvedRemoteEtag: remote.etag };
  assert.equal(isApprovedRemoteBaselineCurrent(record, sourceHash, remoteHash, remote.etag), true);
  assert.equal(isApprovedRemoteBaselineCurrent(record, sourceHash, remoteHash, '"etag-2"'), false);
  assert.equal(isApprovedRemoteBaselineCurrent(record, sourceHash, "changed", remote.etag), false);
  assert.equal(isApprovedRemoteBaselineCurrent(record, "new-source", remoteHash, remote.etag), false);
});

test("duplicate lookup returns only active exact ORBIT links from the persisted target calendar", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [
      remote,
      { ...remote, id: "duplicate" },
      { ...remote, id: "cancelled", status: "cancelled" },
      { ...remote, id: "near-match", description: remote.description!.replace(input.orbitEventId!, "ORB-2027-919684") },
    ] }), { status: 200 });
  }) as typeof fetch;
  try {
    const provider = new GoogleCalendarApiProvider("token", "target-calendar");
    const matches = await provider.findEventsByOrbitEventId(input.orbitEventId!);
    assert.equal(matches.length, 2);
    assert.ok(matches.some((item) => item.id === "calendar-event"));
    assert.ok(matches.some((item) => item.id === "duplicate"));
    assert.match(requestedUrl, /target-calendar/);
    assert.match(requestedUrl, /ORB-2027-919683/);
  } finally { globalThis.fetch = previousFetch; }
});
