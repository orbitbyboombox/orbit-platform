import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEventReadyEmail } from "../../features/accounts-receivable/event-ready-email.template.ts";

const base = {
  customerName: "Camila",
  eventDate: "20 de noviembre de 2026",
  eventLocation: "Santiago",
  eventTime: "18:30 a 20:30",
  service: "Polaroid",
  eventDuration: "2 horas",
};

test("event-ready email preserves premium brand and required confirmation copy", () => {
  const { subject, html } = buildEventReadyEmail(base);
  assert.match(subject, /Todo listo para tu celebración/);
  assert.match(html, /BOOMBOX/);
  assert.match(html, /#111214/);
  assert.match(html, /#f78900/);
  assert.match(html, /EXPERIENCIAS QUE CONECTAN/);
  assert.match(html, /Confirmar horario del servicio/);
  assert.match(html, /Confirmar diseño/);
  assert.match(html, /18:30 a 20:30/);
  assert.doesNotMatch(html, /<button|<form/i);
});

test("event-ready email escapes customer-provided HTML", () => {
  const { html } = buildEventReadyEmail({
    ...base,
    customerName: "<script>alert(1)</script>",
    eventLocation: 'Casa "A" & <b>B</b>',
  });
  assert.doesNotMatch(html, /<script>|<b>B<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
});

test("event-ready email refuses to invent missing event details", () => {
  assert.throws(() => buildEventReadyEmail({...base, eventTime: ""}), /Faltan datos/);
});
