import assert from "node:assert/strict";
import test from "node:test";
import { serviceDisplayName, staffRoleDisplayName, formatServiceDisplayList, staffAssignmentDisplayName } from "../lib/orbit-display-labels.ts";
import { formatServiceSummary } from "../lib/format-service-summary.ts";

test("los servicios muestran la nomenclatura es-CL sin cambiar sus códigos", () => {
  assert.equal(serviceDisplayName("LIGHTBOX"), "Aro de luz");
  assert.equal(serviceDisplayName("LightBox"), "Aro de luz");
  assert.equal(serviceDisplayName("Classic"), "Cabina Classic");
  assert.equal(serviceDisplayName("BLACK_STUDIO"), "Cabina Black Studio");
  assert.equal(serviceDisplayName("BBOX360"), "Plataforma 360°");
  assert.equal(serviceDisplayName("Imanes"), "Fotos con imanes");
  assert.equal(serviceDisplayName("SCRAPBOOK"), "Libro de recuerdos (SCRAPBOOK)");
  assert.equal(serviceDisplayName("Servicio especial"), "Servicio especial");
});

test("operador, montaje y desmontaje conservan funciones independientes", () => {
  assert.equal(staffRoleDisplayName("OPERATOR"), "Operador");
  assert.equal(staffRoleDisplayName("ASSEMBLY"), "Montaje");
  assert.equal(staffRoleDisplayName("DISASSEMBLY"), "Desmontaje");
  assert.equal(staffRoleDisplayName("ASSEMBLY_DISASSEMBLY"), "Montaje y desmontaje");
});

test("resumen de servicios conserva la duración de Classic", () => {
  assert.equal(formatServiceSummary(["Classic", "LightBox"], "4 horas"), "Cabina Classic • 4 horas + Aro de luz");
});

test("próximos eventos muestran servicios y estado de personal en español", () => {
  assert.equal(
    formatServiceDisplayList("BRANDING + CLASSIC + SANTIAGO_PROVINCE + UNLIMITED_MAGNETS · 2 horas"),
    "Personalización + Cabina Classic + Traslado Santiago + Imanes ilimitados · 2 horas",
  );
  assert.equal(formatServiceDisplayList("POLAROID · 3 horas"), "Cabina Polaroid · 3 horas");
  assert.equal(staffAssignmentDisplayName("Staff pendiente"), "Personal pendiente de asignar");
  assert.equal(staffAssignmentDisplayName("Sebastián Jorquera"), "Sebastián Jorquera");
});
