import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVenueName, resolveCanonicalVenue } from "../features/settings/master-data/venue-resolution.ts";

const venues = [
  { name: "Casona Cañaveral", municipality: "Lo Barnechea", aliases: ["Casona Cañaveral", "Cañaveral"], surcharge: 50000 },
  { name: "Club House Valle Escondido", municipality: "Lo Barnechea", aliases: ["Club Valle Escondido", "Valle Escondido"], surcharge: 50000 },
  { name: "Hacienda Santa Martina", municipality: "Lo Barnechea", aliases: ["Santa Martina"], surcharge: 50000 },
  { name: "Alto Noviciado", municipality: "Pudahuel", aliases: ["Alto noviciado"], surcharge: 50000 },
];

test("special venues resolve accent/case/alias variants only within their commune", () => {
  assert.equal(normalizeVenueName("  Casona   CAÑAVERAL "), "casona canaveral");
  assert.equal(resolveCanonicalVenue("casona canaveral", "Lo Barnechea", venues)?.surcharge, 50000);
  assert.equal(resolveCanonicalVenue("Cañaveral", "LO BARNECHEA", venues)?.name, "Casona Cañaveral");
  assert.equal(resolveCanonicalVenue("ALTO NOVICIADO", "Pudahuel", venues)?.name, "Alto Noviciado");
  assert.equal(resolveCanonicalVenue("Alto Noviciado", "Lo Barnechea", venues), null);
  assert.equal(resolveCanonicalVenue("Recinto no catalogado", "Pudahuel", venues), null);
});
