import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { buildCustomerOneDayReminderEmail, buildStaffOneDayReminderEmail } from "./one-day-reminder.template";
import { isWithin24HourWindow } from "./one-day-reminder.time";

const ACTIVE_PROJECT_STATUSES = ["CONFIRMED", "SIGNED"];
const ACCEPTED_ASSIGNMENT_STATUSES = ["ACCEPTED", "CONFIRMED"];
const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCELED", "CLOSED", "ARCHIVED", "DELETED"]);
export const CUSTOMER_ONE_DAY_TYPE = "PRE_EVENT_REMINDER_24H";
export const STAFF_ONE_DAY_TYPE = "STAFF_PRE_EVENT_REMINDER_24H";

type Sender = { send(input: { to: string; subject: string; textBody: string; htmlBody: string; driveFileIds: string[]; idempotencyKey: string; maxSendAttempts: number }): Promise<{ messageId: string; threadId: string }> };
type ReminderProject = { status?: string | null; event_date: string; event_time: string; name?: string | null; customer_id?: string | null; location?: string | null; city?: string | null; customers?: unknown; project_services?: unknown; operations?: unknown; event_operational_requirements?: unknown };
type ReminderStaff = { first_name?: string | null; email?: string | null; status?: string | null; deleted_at?: string | null };

const enabledByDefault = () => process.env.ORBIT_24H_REMINDERS_ENABLED === "true";

function serviceLabel(value: unknown) {
  if (!value) return "Servicio BOOMBOX";
  if (typeof value === "string") return value;
  const item = value as Record<string, unknown>;
  return String(item.label ?? item.name ?? item.service_code ?? "Servicio BOOMBOX");
}

function extrasFrom(value: unknown, requirements: unknown) {
  const output: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const text = typeof item === "string" ? item : serviceLabel(item);
    if (/IMAN|LIBRO|QR|DIGITAL/i.test(text)) output.push(text);
  }
  for (const item of Array.isArray(requirements) ? requirements : []) {
    const row = item as Record<string, unknown>;
    if (String(row.status ?? "").toUpperCase() !== "ACTIVE") continue;
    const text = String(row.label ?? row.code ?? "");
    if (/IMAN|LIBRO|QR|DIGITAL/i.test(text)) output.push(text);
  }
  return [...new Set(output)];
}

function eventIsActive(status: unknown) {
  const normalized = String(status ?? "").toUpperCase();
  return ACTIVE_PROJECT_STATUSES.includes(normalized) && !CANCELLED_STATUSES.has(normalized);
}

async function send(sender: Sender, message: ReturnType<typeof buildCustomerOneDayReminderEmail>, recipient: string, key: string) {
  return sender.send({ to: recipient, subject: message.subject, textBody: message.textBody, htmlBody: message.htmlBody, driveFileIds: [], idempotencyKey: key, maxSendAttempts: 1 });
}

export async function sendAutomaticOneDayReminders(reference = new Date(), options: { enabled?: boolean; sender?: Sender } = {}) {
  const admin = createAdminClient();
  const enabled = options.enabled ?? enabledByDefault();
  const { data: projects, error } = await admin.from("projects").select("id,customer_id,name,event_date,event_time,status,location,city,customers(full_name,email),project_services(service_code,name),operations,event_operational_requirements(code,label,status)").is("deleted_at", null).in("status", ACTIVE_PROJECT_STATUSES);
  if (error) throw error;
  const result = { reference: reference.toISOString(), enabled, customerCandidates: 0, staffCandidates: 0, sent: 0, skipped: 0, blocked: 0, failed: 0 };
  const provider = enabled ? (options.sender ?? new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken())) : null;
  for (const project of projects ?? []) {
    if (!project.event_date || !project.event_time || !isWithin24HourWindow(project.event_date, project.event_time, reference)) continue;
    result.customerCandidates++;
    const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
    const to = String(customer?.email ?? "").trim();
    const key = `pre-event-24h:${project.id}:${project.event_date}`;
    if (!to || !enabled) { result.blocked++; continue; }
    const service = serviceLabel(Array.isArray(project.project_services) ? project.project_services[0] : project.project_services);
    const message = buildCustomerOneDayReminderEmail({ appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl", customerName: String(customer?.full_name ?? "Cliente"), service, eventDate: project.event_date, eventTime: project.event_time.slice(0, 5), location: [project.location, project.city].filter(Boolean).join(" · ") || "Por confirmar" });
    const claim = await admin.from("communications").insert({ customer_id: project.customer_id, project_id: project.id, channel: "GMAIL", direction: "OUTBOUND", communication_type: CUSTOMER_ONE_DAY_TYPE, thread_key: key, request_key: key, subject: message.subject, body: message.textBody, status: "PENDING", to_recipient: to, cc_recipients: [], occurred_at: reference.toISOString(), context_snapshot: { automatic: true, trigger: "24H", eventDate: project.event_date, eventTime: project.event_time } }).select("id").maybeSingle();
    if (claim.error?.code === "23505") { result.skipped++; continue; }
    if (claim.error || !claim.data) { result.failed++; continue; }
    try {
      const sent = await send(provider!, message, to, key);
      const update = await admin.from("communications").update({ status: "SENT", sent_at: new Date().toISOString(), external_message_id: sent.messageId }).eq("id", claim.data.id);
      if (update.error) throw update.error;
      result.sent++;
    } catch (sendError) {
      result.failed++;
      await admin.from("communications").update({ status: "FAILED", failure_reason: sendError instanceof Error ? sendError.message : "Error del proveedor Gmail" }).eq("id", claim.data.id);
    }
  }

  const { data: assignments, error: assignmentError } = await admin.from("assignments").select("id,project_id,staff_id,assignment_type,status,deleted_at,staff(first_name,email,status,deleted_at),projects(id,name,customer_id,event_date,event_time,status,location,city,customers(full_name),project_services(service_code,name,extras),operations,event_operational_requirements(code,label,status))").is("deleted_at", null).in("status", ACCEPTED_ASSIGNMENT_STATUSES);
  if (assignmentError) throw assignmentError;
  const grouped = new Map<string, { project: ReminderProject; staff: ReminderStaff; roles: string[] }>();
  for (const row of assignments ?? []) {
    const project = (Array.isArray(row.projects) ? row.projects[0] : row.projects) as ReminderProject | null;
    const staff = (Array.isArray(row.staff) ? row.staff[0] : row.staff) as ReminderStaff | null;
    if (!project || !staff || !eventIsActive(project.status) || !project.event_date || !project.event_time || !staff.email || staff.status !== "ACTIVE" || staff.deleted_at || !isWithin24HourWindow(project.event_date, project.event_time, reference)) continue;
    const key = `${row.project_id}:${row.staff_id}`;
    const current = grouped.get(key);
    if (current) current.roles.push(row.assignment_type); else grouped.set(key, { project, staff, roles: [row.assignment_type] });
  }
  for (const [groupKey, candidate] of grouped) {
    result.staffCandidates++;
    const [projectId, staffId] = groupKey.split(":");
    const key = `staff-24h:${projectId}:${staffId}:${candidate.project.event_date}`;
    if (!enabled) { result.blocked++; continue; }
    const customer = Array.isArray(candidate.project.customers) ? candidate.project.customers[0] : candidate.project.customers;
    const serviceRecord = (Array.isArray(candidate.project.project_services) ? candidate.project.project_services[0] : candidate.project.project_services) as Record<string, unknown> | null;
    const service = serviceLabel(serviceRecord);
    const operations = candidate.project.operations as Record<string, unknown> | null;
    const extras = extrasFrom(serviceRecord?.extras ?? operations?.extras ?? operations, candidate.project.event_operational_requirements);
    const message = buildStaffOneDayReminderEmail({ appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl", firstName: String(candidate.staff.first_name ?? "Staff"), customerName: String(customer?.full_name ?? "Cliente"), service, eventDate: candidate.project.event_date, assignmentTime: candidate.project.event_time.slice(0, 5), location: [candidate.project.location, candidate.project.city].filter(Boolean).join(" · ") || "Por confirmar", role: [...new Set(candidate.roles)].join(" + "), extras });
    const claim = await admin.from("internal_notifications").upsert({ project_id: projectId, customer_id: candidate.project.customer_id, staff_id: staffId, notification_type: STAFF_ONE_DAY_TYPE, title: "TIENES EVENTO MAÑANA", message: message.textBody, status: "UNREAD", correlation_id: key, category: "STAFF", priority: "NORMAL", action_required: false, entity_type: "Project", entity_id: projectId, related_href: "/staff-portal", metadata: { email_status: "CLAIMED", event_date: candidate.project.event_date, event_time: candidate.project.event_time, roles: [...new Set(candidate.roles)] } }, { onConflict: "correlation_id", ignoreDuplicates: true }).select("id");
    if (claim.error) { result.failed++; continue; }
    if (!claim.data?.length) { result.skipped++; continue; }
    try {
      const sent = await send(provider!, message, String(candidate.staff.email), key);
      const update = await admin.from("internal_notifications").update({ metadata: { email_status: "SENT", event_date: candidate.project.event_date, event_time: candidate.project.event_time, roles: [...new Set(candidate.roles)], message_id: sent.messageId, sent_at: new Date().toISOString() } }).eq("id", claim.data[0].id);
      if (update.error) throw update.error;
      result.sent++;
    } catch (sendError) {
      result.failed++;
      await admin.from("internal_notifications").update({ metadata: { email_status: "FAILED", error: sendError instanceof Error ? sendError.message : "Error del proveedor Gmail" } }).eq("id", claim.data[0].id);
    }
  }
  return result;
}
