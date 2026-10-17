import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chileTomorrow,
  isChileD1ReminderWindow,
  isWithinChileD1Window,
  isSpecialOperationalStaffId,
  operationalD1Candidates,
  operationalReminderCorrelation,
  specialD1Candidates,
  specialReminderCorrelation,
  SPECIAL_OPERATIONAL_STAFF_IDS,
  SPECIAL_OPERATIONAL_STAFF_MESSAGE,
  type OperationalReminderAssignment,
  type SpecialReminderAssignment,
} from "../features/operations/special-operational-staff-reminder.model.ts";
import {
  buildStaffD1ReminderEmail,
  formatStaffCallTime,
} from "../features/staff-communications/staff-email.templates.ts";

const [sebastian, jose, fernando] = SPECIAL_OPERATIONAL_STAFF_IDS;
const tomorrow = "2026-09-16";
const base = (
  staffId: string,
  projectId = "event-1",
): SpecialReminderAssignment => ({
  projectId,
  staffId,
  assignmentStatus: "CONFIRMED",
  assignmentDeletedAt: null,
  eventDate: tomorrow,
  projectStatus: "CONFIRMED",
  projectDeletedAt: null,
  staffStatus: "ACTIVE",
  staffDeletedAt: null,
  email: "staff@example.test",
});

test("only the three exact staff IDs receive the special policy", () => {
  for (const id of SPECIAL_OPERATIONAL_STAFF_IDS)
    assert.equal(isSpecialOperationalStaffId(id), true);
  for (const id of [
    "other-staff",
    null,
    undefined,
    "Sebastián Jorquera",
    "staff@example.test",
  ])
    assert.equal(isSpecialOperationalStaffId(id), false);
  assert.equal(
    SPECIAL_OPERATIONAL_STAFF_MESSAGE,
    "Recuerda que mañana tienes evento BOOMBOX.",
  );
});
test("Sebastián gets one candidate with one or three roles", () => {
  assert.equal(specialD1Candidates([base(sebastian)], tomorrow).length, 1);
  assert.equal(
    specialD1Candidates(
      [base(sebastian), base(sebastian), base(sebastian)],
      tomorrow,
    ).length,
    1,
  );
});
test("José and Fernando each get one candidate across multiple roles", () => {
  const rows = [
    base(jose),
    base(jose),
    base(fernando),
    base(fernando),
    base(fernando),
  ];
  assert.deepEqual(
    specialD1Candidates(rows, tomorrow).map((row) => row.staffId),
    [jose, fernando],
  );
});
test("one cancelled role does not remove an active role; all cancelled suppress the notice", () => {
  const cancelled = { ...base(sebastian), assignmentStatus: "CANCELLED" };
  assert.equal(
    specialD1Candidates([cancelled, base(sebastian)], tomorrow).length,
    1,
  );
  assert.equal(
    specialD1Candidates(
      [
        cancelled,
        { ...base(sebastian), assignmentDeletedAt: "2026-09-15T00:00:00Z" },
      ],
      tomorrow,
    ).length,
    0,
  );
});
test("date change recalculates D-1 from the canonical event date", () => {
  assert.equal(
    specialD1Candidates(
      [{ ...base(sebastian), eventDate: "2026-09-17" }],
      tomorrow,
    ).length,
    0,
  );
  assert.equal(
    specialD1Candidates(
      [{ ...base(sebastian), eventDate: "2026-09-17" }],
      "2026-09-17",
    ).length,
    1,
  );
  assert.equal(chileTomorrow(new Date("2026-09-15T12:00:00Z")), tomorrow);
  assert.equal(chileTomorrow(new Date("2026-09-16T02:30:00Z")), tomorrow); // Still September 15 in Chile.
});
test("reassignment is eligible again but keeps the same event/person delivery key", () => {
  const replaced = [
    { ...base(sebastian), assignmentStatus: "CANCELLED" },
    base(sebastian),
  ];
  assert.equal(specialD1Candidates(replaced, tomorrow).length, 1);
  assert.equal(
    specialReminderCorrelation("event-1", sebastian),
    specialReminderCorrelation("event-1", sebastian),
  );
  assert.notEqual(
    specialReminderCorrelation("event-1", sebastian),
    specialReminderCorrelation("event-2", sebastian),
  );
});
test("mixed Staff leaves normal Staff out of the special candidate set", () => {
  const rows = [base("normal-1"), base(jose), base("normal-2"), base(jose)];
  assert.deepEqual(
    specialD1Candidates(rows, tomorrow).map((row) => row.staffId),
    [jose],
  );
});
test("global D-1 groups every Staff person/event and merges roles", () => {
  const row = (
    staffId: string,
    role: string,
  ): OperationalReminderAssignment => ({
    ...base(staffId),
    firstName: "Staff",
    eventName: "Evento Premium",
    eventTime: "20:30:00",
    location: "Colina",
    role,
    customerId: "customer-1",
  });
  const candidates = operationalD1Candidates(
    [
      row("normal-1", "OPERATOR"),
      row("normal-1", "ASSEMBLY"),
      row(jose, "OPERATOR"),
    ],
    tomorrow,
  );
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].roles, ["OPERATOR", "ASSEMBLY"]);
  assert.equal(
    operationalReminderCorrelation("event-1", "normal-1"),
    "staff-d1:event-1:normal-1",
  );
  assert.equal(
    operationalReminderCorrelation("event-1", jose),
    specialReminderCorrelation("event-1", jose),
  );
});
test("D-1 delivery window prefers 19:00 and permits only the 20:00 fallback", () => {
  assert.equal(isChileD1ReminderWindow(new Date("2026-09-16T22:00:00Z")), true); // 19:00 CLST
  assert.equal(isChileD1ReminderWindow(new Date("2026-09-16T23:00:00Z")), true); // exact 20:00 fallback
  assert.equal(
    isChileD1ReminderWindow(new Date("2026-09-16T23:01:00Z")),
    false,
  );
  assert.equal(
    isChileD1ReminderWindow(new Date("2026-09-16T23:30:00Z")),
    false,
  );
  assert.equal(
    isChileD1ReminderWindow(new Date("2026-09-17T00:00:00Z")),
    false,
  );
});
test("D-1 delivery follows the real Chile event time", () => {
  assert.equal(
    isWithinChileD1Window(
      new Date("2026-09-15T22:30:00Z"),
      "2026-09-16",
      "19:30:00",
    ),
    true,
  );
  assert.equal(
    isWithinChileD1Window(
      new Date("2026-09-15T20:00:00Z"),
      "2026-09-16",
      "19:30:00",
    ),
    false,
  );
  assert.equal(
    isWithinChileD1Window(
      new Date("2026-09-16T22:30:00Z"),
      "2026-09-16",
      "19:30:00",
    ),
    false,
  );
});
test("premium D-1 includes event truth, roles, address, CTA and BOOMBOX styling", () => {
  const email = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Sebastián",
    eventName: "Evento corporativo",
    eventDate: tomorrow,
    roles: ["OPERATOR", "ASSEMBLY"],
    eventTime: "20:30:00",
    location: "Puerta Oriente 361",
  });
  assert.match(email.htmlBody, /Recuerda que mañana tienes evento BOOMBOX\./);
  assert.match(email.htmlBody, /Evento corporativo/);
  assert.match(email.htmlBody, /Operador · Montaje/);
  assert.match(email.htmlBody, /Puerta Oriente 361/);
  assert.match(email.htmlBody, /Ver detalle en ORBIT/);
  assert.match(email.htmlBody, /#f78900/);
  assert.match(email.htmlBody, /BOOMBOX/);
});
test("premium D-1 groups operational context and omits absent extras", () => {
  const email = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Sebastián",
    eventName: "Evento Esencial",
    eventDate: tomorrow,
    roles: ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"],
    eventTime: "20:30:00",
    staffCallAt: "2026-09-16T18:45:00-03:00",
    location: "Centro de Eventos · Avenida Siempre Viva 123, Santiago",
    customerName: "Cliente de prueba",
    service: "BBOX360",
    instructions: "Retirar imanes al finalizar.",
    specialElements: ["IMANES", "QR DIGITAL"],
  });
  assert.match(email.textBody, /Cliente: Cliente de prueba/);
  assert.match(email.textBody, /Servicio: BBOX360/);
  assert.match(email.textBody, /Citación:/);
  assert.match(email.textBody, /Operador · Montaje · Desmontaje/);
  assert.match(email.htmlBody, /IMANES · QR DIGITAL/);
  const withoutExtras = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Montaje",
    eventName: "Evento sin extras",
    eventDate: tomorrow,
    roles: ["ASSEMBLY"],
  });
  assert.doesNotMatch(withoutExtras.textBody, /Elementos:/);
  assert.doesNotMatch(withoutExtras.htmlBody, /Elementos operativos/);
});
test("staff call displays only the Chilean clock from an ISO timestamp", () => {
  assert.equal(
    formatStaffCallTime("2026-10-17T21:30:00-03:00"),
    "21:30 hrs.",
  );
  const email = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Rosario",
    eventName: "Evento Rosario Alonso",
    eventDate: "2026-10-17",
    eventTime: "22:30:00",
    roles: ["OPERATOR"],
    staffCallAt: "2026-10-17T21:30:00-03:00",
  });
  assert.match(email.textBody, /Citación: 21:30 hrs\./);
  assert.doesNotMatch(email.textBody, /2026-/);
  assert.match(email.htmlBody, /Hora de citación:<\/strong> 21:30 hrs\./);
});
test("operator fallback handles midnight rollover while assembly keeps its own schedule", () => {
  const operator = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Operador",
    eventName: "Evento nocturno",
    eventDate: "2026-10-18",
    eventTime: "00:30:00",
    roles: ["OPERATOR"],
  });
  assert.match(operator.textBody, /Citación: 23:30 hrs\./);
  const assembly = buildStaffD1ReminderEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Montaje",
    eventName: "Evento nocturno",
    eventDate: "2026-10-18",
    eventTime: "00:30:00",
    roles: ["ASSEMBLY"],
  });
  assert.doesNotMatch(assembly.textBody, /Citación:/);
});
test("removed Staff, closed event, missing email and inactive Staff are excluded", () => {
  for (const change of [
    { staffStatus: "INACTIVE" },
    { staffDeletedAt: "2026-09-15" },
    { projectStatus: "CANCELLED" },
    { projectDeletedAt: "2026-09-15" },
    { email: null },
  ]) {
    assert.equal(
      specialD1Candidates([{ ...base(fernando), ...change }], tomorrow).length,
      0,
    );
  }
});
test("all email entry points use the ID policy and D-1 claims are person/event scoped", () => {
  const immediate = readFileSync(
    "features/operations/staff-assignment-notification.service.ts",
    "utf8",
  );
  const approved = readFileSync(
    "features/operations/smart-assignment-package.service.ts",
    "utf8",
  );
  const cancellation = readFileSync(
    "features/operations/staff-assignment-cancellation.service.ts",
    "utf8",
  );
  const cron = readFileSync(
    "app/api/cron/staff-assignment-reminders/route.ts",
    "utf8",
  );
  for (const text of [immediate, approved, cancellation])
    assert.match(text, /isSpecialOperationalStaffId/);
  assert.match(
    cron,
    /operationalReminderCorrelation\([\s\S]*candidate\.projectId,[\s\S]*candidate\.staffId/,
  );
  assert.match(cron, /ignoreDuplicates:\s*true/);
  assert.match(cron, /maxSendAttempts:\s*1/);
  assert.match(cron, /currentProject\.event_date !== candidate\.eventDate/);
  assert.match(
    cron,
    /\.contains\("metadata",\s*\{\s*hours_before:\s*24,\s*email_status:\s*"SENT"\s*\}\)/,
  );
  assert.match(cron, /operationalD1Candidates\(operationalRows, tomorrow\)/);
  assert.match(cron, /isWithinChileD1Window\(reference, candidate\.eventDate, candidate\.eventTime\)/);
  assert.doesNotMatch(cron, /staff-assignment-reminder:\$\{row\.id\}:\$\{window\}/);
});
