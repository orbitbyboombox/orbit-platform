import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("automatic booking exposes the customer-friendly operational labels without changing payload keys", async () => {
  const automatic = await read("features/automatic-booking/automatic-booking-experience.tsx");
  const manual = await read("features/projects/components/new-project-drawer.tsx");
  const portal = await read("features/customer-portal/customer-event-experience.tsx");
  for (const source of [automatic, manual, portal]) {
    assert.match(source, /Encargado de tu evento/);
  }
  assert.match(automatic, /Teléfono encargado de tu evento/);
  assert.match(manual, /Teléfono encargado de tu evento/);
  assert.match(automatic, /operationalContact/);
  assert.match(automatic, /operationalPhone/);
  assert.doesNotMatch(automatic, /label="Contacto operacional"/);
  assert.doesNotMatch(automatic, /label="Teléfono operacional"/);
});

test("booking confirmation gives persistent real-work feedback with accessible motion", async () => {
  const source = await read("features/automatic-booking/automatic-booking-experience.tsx");
  const styles = await read("app/globals.css");
  assert.match(source, /Procesando tu reserva/);
  assert.match(source, /Este proceso puede durar un par de minutos/);
  assert.match(source, /aria-busy=\{working\}/);
  assert.match(source, /data-testid="booking-processing-indicator"/);
  assert.match(source, /booking-processing-clock/);
  assert.match(source, /booking-processing-step-spinner/);
  assert.match(source, /booking-processing-heartbeat/);
  assert.match(source, /createProcessingActivityTicker/);
  assert.match(source, /formatElapsedSeconds/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@keyframes orbitBookingSpin/);
  assert.match(styles, /@keyframes orbitBookingDotPulse/);
  assert.match(styles, /animation-play-state: running/);
  assert.match(styles, /animation-iteration-count: infinite/);
});

test("booking confirmation keeps contract access in the email and removes tokenized CTAs", async () => {
  const source = await read("features/automatic-booking/automatic-booking-experience.tsx");
  assert.match(source, /Te enviamos por correo la confirmación, tu acceso al Portal y tu contrato/);
  assert.doesNotMatch(source, /REVISAR CONTRATO EN MI PORTAL/);
  assert.doesNotMatch(source, /portalUrl\?:string/);
  assert.doesNotMatch(source, />Descargar contrato<\//);
});
