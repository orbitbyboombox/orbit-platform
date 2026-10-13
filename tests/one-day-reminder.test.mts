import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCustomerOneDayReminderEmail, buildStaffOneDayReminderEmail } from "../features/connectors/google-gmail/application/one-day-reminder.template.ts";
import { chileEventInstant, isWithin24HourWindow } from "../features/connectors/google-gmail/application/one-day-reminder.time.ts";

const root = (path: string) => readFileSync(path, "utf8");

test("customer 24h template reuses premium BOOMBOX identity and exact copy", () => {
  const email = buildCustomerOneDayReminderEmail({ appUrl: "https://app.bbox.cl", customerName: "Mariana", service: "Servicio 12 horas", eventDate: "2026-10-14", eventTime: "20:30", location: "Santiago" });
  assert.equal(email.subject, "BOOMBOX | ¡Nos vemos mañana con todo!");
  for (const value of ["¡NOS VEMOS MAÑANA CON TODO!", "DETALLES DE TU EXPERIENCIA", "#f78900", "boombox-official-logo.png", "Mariana"]) assert.match(email.htmlBody, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("staff 24h template includes only event-specific assignment details", () => {
  const email = buildStaffOneDayReminderEmail({ appUrl: "https://app.bbox.cl", firstName: "Sebastián", customerName: "Mariana", service: "Servicio 12 horas", eventDate: "2026-10-14", assignmentTime: "19:30", location: "Santiago", role: "OPERATOR", extras: ["QR DIGITAL"] });
  assert.equal(email.subject, "BOOMBOX STAFF | Tienes evento mañana");
  for (const value of ["TIENES EVENTO MAÑANA", "QR DIGITAL", "BOOMBOX STAFF", "19:30"]) assert.match(email.htmlBody, new RegExp(value));
});

test("24h window uses America/Santiago and tolerates hourly cron timing", () => {
  const event = chileEventInstant("2026-10-14", "20:30");
  assert.equal(isWithin24HourWindow("2026-10-14", "20:30", new Date(event.getTime() - 23.5 * 60 * 60 * 1000)), true);
  assert.equal(isWithin24HourWindow("2026-10-14", "20:30", new Date(event.getTime() - 22.9 * 60 * 60 * 1000)), false);
});

test("D-10 remains separate and real 24h sends are disabled by default", () => {
  const d10 = root("features/connectors/google-gmail/application/pre-event-reminder.service.ts");
  const route = root("app/api/cron/one-day-reminders/route.ts");
  const migration = root("supabase/migrations/20261013120000_one_day_reminder_idempotency.sql");
  assert.match(d10, /sendAutomaticPreEventReminders/);
  assert.match(route, /sendAutomaticOneDayReminders/);
  assert.match(root("features/connectors/google-gmail/application/one-day-reminder.service.ts"), /ORBIT_24H_REMINDERS_ENABLED === "true"/);
  assert.match(root("app/api/cron/staff-assignment-reminders/route.ts"), /oneDayRemindersEnabled \? \[\] : data/);
  assert.match(root("vercel.json"), /one-day-reminders[\s\S]*\*\/15 \* \* \* \*/);
  assert.match(migration, /communications_one_day_reminder_request_uidx/);
  assert.match(migration, /internal_notifications_staff_one_day_correlation_uidx/);
});
