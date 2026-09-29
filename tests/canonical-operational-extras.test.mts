import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCanonicalOperationalExtras } from "../features/operations/canonical-operational-extras.ts";

describe("canonical operational extras", () => {
  it("normalizes Magdalena's sources without duplicating categories", () => {
    const result = buildCanonicalOperationalExtras({
      serviceExtras: ["QR incluido", "Scrapbook incluido", "QR"],
      postReservationExtras: ["IMANES BOOMBOX"],
      transportTotal: 0,
    });
    assert.deepEqual(result.categories, {
      QR: true,
      IMANES: true,
      SCRAPBOOK: true,
      FONDO: false,
      TRASLADO: false,
      OTROS: false,
    });
    assert.deepEqual(result.calendarLines, ["QR: SÍ", "IMANES: SÍ", "SCRAPBOOK: SÍ", "FONDO: NO", "TRASLADO: NO", "OTROS: NO"]);
  });

  it("detects backdrop and transport independently", () => {
    const result = buildCanonicalOperationalExtras({
      configuredExtras: ["Fondo 230x200 Blanco"],
      transportTotal: 1,
    });
    assert.equal(result.categories.FONDO, true);
    assert.equal(result.categories.TRASLADO, true);
  });
});
