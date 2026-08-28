import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type FounderActionPriority = "P0" | "P1" | "P2";

export type FounderActionItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  priority: FounderActionPriority;
  category: string;
  read: boolean;
  cta: string;
};

export type FounderActionCenter = {
  count: number;
  items: FounderActionItem[];
};

const priority = (type: string, value: string): FounderActionPriority => {
  if (value === "CRITICAL") return "P0";
  if (["STAFF_ONBOARDING_REVIEW_REQUIRED", "STAFF_EXPENSE_REVIEW_REQUIRED"].includes(type)) return "P1";
  return value === "HIGH" ? "P1" : "P2";
};

const cta = (type: string) =>
  type === "STAFF_ONBOARDING_REVIEW_REQUIRED"
    ? "REVISAR OPERADOR"
    : type === "STAFF_EXPENSE_REVIEW_REQUIRED"
      ? "REVISAR GASTO"
      : "REVISAR";

const canonicalFounderActionTypeList = [
  "STAFF_ONBOARDING_REVIEW_REQUIRED",
  "STAFF_EXPENSE_REVIEW_REQUIRED",
  "HEALTH_WARNING",
  "EVENT_NOT_READY",
  "INVOICE_OVERDUE",
  "INVOICE_DUE_TODAY",
  "INVOICE_DUE_SOON",
] as const;
const canonicalFounderActionTypes = new Set<string>(canonicalFounderActionTypeList);

const loadFounderActionCenterCached = cache(async (userId: string): Promise<FounderActionCenter> => {
  const admin = createAdminClient();
  const { error: reconciliationError } = await admin.rpc("reconcile_founder_action_alerts");
  if (reconciliationError) throw reconciliationError;
  const [{ data: rows, error }, { data: states, error: statesError }] = await Promise.all([
    admin
      .from("internal_notifications")
      .select("id,notification_type,title,message,created_at,category,priority,related_href,entity_type,entity_id")
      .eq("action_required", true)
      .neq("status", "RESOLVED")
      .in("notification_type", [...canonicalFounderActionTypeList])
      .order("created_at", { ascending: false })
      .limit(250),
    admin.from("notification_user_states").select("notification_id,read_at").eq("user_id", userId),
  ]);
  if (error || statesError) throw error ?? statesError;
  const readIds = new Set((states ?? []).filter((state) => state.read_at).map((state) => state.notification_id));
  const projected = (rows ?? [])
    .filter((row) => canonicalFounderActionTypes.has(row.notification_type))
    .map((row) => ({
      id: row.id,
      type: row.notification_type,
      title: row.title,
      detail: row.message,
      href: row.related_href ?? "/notifications",
      createdAt: row.created_at,
      priority: priority(row.notification_type, row.priority),
      category: row.category,
      read: readIds.has(row.id),
      cta: cta(row.notification_type),
      canonicalKey: `${row.entity_type ?? row.notification_type}:${row.entity_id ?? row.id}`,
    }))
    .sort((a, b) => a.priority.localeCompare(b.priority) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const seen = new Set<string>();
  const items = projected.filter((item) => {
    if (seen.has(item.canonicalKey)) return false;
    seen.add(item.canonicalKey);
    return true;
  });
  return { count: items.length, items };
});

export async function loadFounderActionCenter(userId: string) {
  return loadFounderActionCenterCached(userId);
}

export async function loadFounderActionCount(userId: string) {
  return (await loadFounderActionCenter(userId)).count;
}
