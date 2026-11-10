import "server-only";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFounderActionCenter } from "@/features/founder-action-center";
import { isD10ManualCollectionDue } from "@/features/accounts-receivable/d10-manual-collection";
import type { NotificationInbox, NotificationCategory, NotificationPriority, ExternalCleanupResidualJob } from "./types";

export async function loadNotificationInbox(userId: string): Promise<NotificationInbox> {
  const admin = createAdminClient();
  const actionCenter = await loadFounderActionCenter(userId);
  const actionIds = new Set(actionCenter.items.map((item) => item.id));
  const [{ data: rows, error }, { data: states }, { data: settings }, { data: d10Rows, error: d10Error }] = await Promise.all([
    admin.from("internal_notifications").select("id,notification_type,title,message,status,created_at,category,priority,action_required,related_href,project_id,customer_id,staff_id,projects(name),customers(full_name),staff(first_name,last_name)").neq("status", "RESOLVED").order("created_at", { ascending: false }).limit(250),
    admin.from("notification_user_states").select("notification_id,read_at,archived_at,dismissed_at").eq("user_id", userId),
    admin.from("notification_settings").select("retention_days").eq("singleton_key", "PRIMARY").maybeSingle(),
    admin.from("accounts_receivable_projection").select("id,project_id,amount,paid_amount,outstanding_balance,status,effective_status,deleted_at,archived_at,cancelled_at,projects(id,name,event_date,status),customers(full_name)").gt("outstanding_balance", 0),
  ]);
  if (error) throw error;
  let scheduleRows: Array<{ project_id: string; scheduled_for: string }> = [];
  if (!d10Error || (d10Error.code !== "42P01" && d10Error.code !== "PGRST205")) {
    const result = await admin.from("d10_manual_collection_schedules").select("project_id,scheduled_for");
    if (result.error && result.error.code !== "42P01" && result.error.code !== "PGRST205") throw result.error;
    scheduleRows = (result.data ?? []) as Array<{ project_id: string; scheduled_for: string }>;
  }
  const d10Schedules = new Map(scheduleRows.map((row) => [row.project_id, row.scheduled_for]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d10ByProject = new Map<string, NonNullable<typeof d10Rows>[number]>();
  (d10Rows ?? []).filter((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    if (row.deleted_at || row.archived_at || row.cancelled_at) return false;
    return isD10ManualCollectionDue({ eventDate: project?.event_date, outstandingBalance: Number(row.outstanding_balance ?? Number(row.amount ?? 0) - Number(row.paid_amount ?? 0)), status: row.status ?? row.effective_status, projectStatus: project?.status, scheduledFor: d10Schedules.get(row.project_id) }, today);
  }).forEach((row) => { if (row.project_id && !d10ByProject.has(row.project_id)) d10ByProject.set(row.project_id, row); });
  const d10Derived = [...d10ByProject.values()].map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return { id: `d10-collection:${row.project_id}`, category: "PAYMENTS" as NotificationCategory, priority: "HIGH" as NotificationPriority, type: "COLLECTION_D10_MANUAL", title: "Cobranza D-10 pendiente", message: `${customer?.full_name ?? "Cliente"} · ${project?.name ?? "Evento"} tiene saldo pendiente a 10 días del evento.`, createdAt: new Date().toISOString(), actionRequired: true, read: false, archived: false, derived: true, relatedHref: `/finance/collections?filter=D10&project=${row.project_id}`, project: project?.name, customer: customer?.full_name };
  });
  const { data: residualRows } = await admin.from("event_deletion_jobs").select("id,project_id,cleanup_residuals,projects(orbit_event_id)").eq("status", "COMPLETED_WITH_EXTERNAL_RESIDUALS").order("completed_at", { ascending: false }).limit(50);
  const externalCleanupResiduals: ExternalCleanupResidualJob[] = (residualRows ?? []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const residuals = Array.isArray(row.cleanup_residuals) ? row.cleanup_residuals.filter((item: unknown) => Boolean((item as { requiresManualAction?: unknown })?.requiresManualAction)) as Array<{ resourceId?: unknown }> : [];
    return { id: row.id, projectId: row.project_id, orbitEventId: project?.orbit_event_id ?? null, residualCount: residuals.length, resourceIds: residuals.map((item) => String(item.resourceId ?? "")).filter(Boolean) };
  }).filter((row) => row.residualCount > 0);
  const stateMap = new Map((states ?? []).map((item) => [item.notification_id, item]));
  const notifications = (rows ?? []).map((item) => {
    const state = stateMap.get(item.id);
    const project = Array.isArray(item.projects) ? item.projects[0] : item.projects;
    const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers;
    const staff = Array.isArray(item.staff) ? item.staff[0] : item.staff;
    const actionRequired = actionIds.has(item.id);
    return { id: item.id, category: item.category as NotificationCategory, priority: item.priority as NotificationPriority, type: item.notification_type, title: item.title, message: item.message, status: item.status, createdAt: item.created_at, actionRequired, read: Boolean(state?.read_at), archived: actionRequired ? false : Boolean(state?.archived_at || state?.dismissed_at), relatedHref: item.related_href ?? undefined, project: project?.name, customer: customer?.full_name, staff: staff ? `${staff.first_name} ${staff.last_name}` : undefined };
  });
  const derived = actionCenter.items.filter((item) => item.type === "OVERDUE_INVOICE_GROUP").map((item) => ({ id: item.id, category: item.category as NotificationCategory, priority: "NORMAL" as NotificationPriority, type: item.type, title: item.title, message: item.detail, createdAt: item.createdAt, actionRequired: true, read: true, archived: false, derived: true, relatedHref: item.href }));
  const combined = [...d10Derived, ...derived, ...notifications];
  return { notifications: combined, unreadCount: combined.filter((item) => !item.read && !item.archived).length, actionableCount: actionCenter.count, retentionDays: settings?.retention_days ?? 30, generatedAt: new Date().toISOString(), externalCleanupResiduals };
}

export async function recordAdministratorAccess(kind: "SUCCESS" | "FAILED", userId?: string) {
  if (isReadOnlyVisualPreview()) return;
  const admin = createAdminClient();
  const now = new Date();
  const correlation = `admin-access:${kind.toLowerCase()}:${crypto.randomUUID()}`;
  const title = kind === "SUCCESS" ? "Nuevo acceso administrativo" : "Intento de acceso administrativo no validado";
  const message = kind === "SUCCESS" ? "Se inició una nueva sesión administrativa en ORBIT." : "ORBIT rechazó un intento de acceso administrativo.";
  const { error } = await admin.from("internal_notifications").insert({ notification_type: kind === "SUCCESS" ? "ADMIN_LOGIN" : "FAILED_LOGIN", title, message, status: "UNREAD", correlation_id: correlation, category: "SECURITY", priority: kind === "SUCCESS" ? "INFORMATION" : "HIGH", action_required: kind === "FAILED", entity_type: "Authentication", entity_id: userId ?? correlation, related_href: "/settings/health", metadata: { occurred_at: now.toISOString() } });
  if (error) throw error;
}
