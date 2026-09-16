import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chileTomorrow,
  isChileD1ReminderWindow,
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
import { buildStaffD1ReminderEmail } from "../features/staff-communications/staff-email.templates.ts";

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
  for (const text of [immediate, approved, cancellation, cron])
    assert.match(text, /isSpecialOperationalStaffId/);
  assert.match(
    cron,
    /operationalReminderCorrelation\([\s\S]*candidate\.projectId,[\s\S]*candidate\.staffId/,
  );
  assert.match(cron, /ignoreDuplicates:\s*true/);
  assert.match(cron, /maxSendAttempts:\s*1/);
  assert.match(cron, /currentProject\.event_date !== tomorrow/);
  assert.match(
    cron,
    /\.contains\("metadata",\s*\{\s*hours_before:\s*24,\s*email_status:\s*"SENT"\s*\}\)/,
  );
  assert.match(
    cron,
    /if \(isSpecialOperationalStaffId\(row\.staff_id\)\) continue/,
  );
});
