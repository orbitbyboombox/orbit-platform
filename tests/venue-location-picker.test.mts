import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("components/forms/venue-location-picker.tsx", "utf8");
const automatic = await readFile("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const manual = await readFile("features/projects/components/new-project-drawer.tsx", "utf8");

test("venue suggestions keep surcharge outside the dropdown", () => {
  assert.match(source, /\{option\.label\}/);
  assert.doesNotMatch(source, /option\.surcharge/);
  assert.match(source, /Valor adicional de traslado/);
  assert.match(source, /specialVenue/);
  assert.match(source, /onSpecialVenueChange/);
  assert.match(source, /Escribe cualquier lugar o recinto/);
});

test("automatic and manual booking reuse the same venue selector", () => {
  assert.match(automatic, /VenueLocationPicker/);
  assert.match(manual, /VenueLocationPicker/);
  assert.doesNotMatch(automatic, /MunicipalityCombobox/);
  assert.doesNotMatch(manual, /MunicipalityCombobox/);
});
