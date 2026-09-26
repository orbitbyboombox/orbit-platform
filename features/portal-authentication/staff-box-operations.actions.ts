"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "./portal-auth.service";

export type StaffBoxComponent = { id: string; code: string; type: string; status: string };
export type StaffPaperStatus = "PENDING" | "READY_TO_CLOSE" | "CONFIRMED" | "OVERRIDDEN";
export type StaffPaperSnapshot = { id: string; paperRequired: boolean; openingBalance: number; reloads: number; finalRemaining: number | null; eventUsage: number | null; status: StaffPaperStatus; format: string | null; lot: string | null; reminderSentAt: string | null };
export type StaffBoxAssignment = { id: string; boxId: string; boxCode: string; boxStatus: string; assignmentStatus: string; components: StaffBoxComponent[]; mediaLotId: string | null; mediaRemaining: number | null; format: string | null; lot: string | null; paper: StaffPaperSnapshot | null };
type StaffComponentInput = { componentId: string; status: string; notes?: string; incident?: boolean };

async function staffContext(projectId: string, allowedRoles?: string[]) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) throw new Error("Tu sesión expiró.");
  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin.from("staff").select("id,status,portal_enabled,deleted_at").eq("id", session.staff_id).maybeSingle();
  if (staffError) throw staffError;
  if (!staff || staff.status !== "ACTIVE" || !staff.portal_enabled || staff.deleted_at) throw new Error("Tu acceso operacional ya no está habilitado.");
  const query = admin.from("assignments").select("assignment_type").eq("project_id", projectId).eq("staff_id", session.staff_id).in("status", ["CONFIRMED", "ACCEPTED", "COMPLETED"]).is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const roles = (data ?? []).map((row) => row.assignment_type);
  if (!roles.length || (allowedRoles && !roles.some((role) => allowedRoles.includes(role)))) throw new Error("No tienes la responsabilidad operacional requerida para este paso.");
  return { admin, staffId: session.staff_id, portalSessionId: session.id, roles };
}

export async function loadStaffBoxOperationsAction(projectId: string): Promise<{ ok: true; assignment: StaffBoxAssignment; roles: string[] } | { ok: false; message: string }> {
  try {
    const { admin, roles } = await staffContext(projectId);
    const { data: rows, error } = await admin.from("asset_assignments").select("id,asset_id,assignment_status,operational_assets!inner(id,asset_code,status,asset_type)").eq("project_id", projectId).eq("assignment_status", "ASSIGNED").is("deleted_at", null).eq("operational_assets.asset_type", "BOX").limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (!row) return { ok: true, roles, assignment: { id: "", boxId: "", boxCode: "", boxStatus: "", assignmentStatus: "", components: [], mediaLotId: null, mediaRemaining: null, format: null, lot: null, paper: null } };
    const box = Array.isArray(row.operational_assets) ? row.operational_assets[0] : row.operational_assets;
    const [{ data: components, error: componentError }, { data: lots, error: lotError }, { data: snapshots, error: snapshotError }] = await Promise.all([
      admin.from("operational_assets").select("id,asset_code,asset_type,status").eq("parent_asset_id", row.asset_id).is("deleted_at", null).order("asset_code"),
      admin.from("box_media_lots").select("id,remaining_photo_capacity,format_key,lot").eq("box_asset_id", row.asset_id).eq("status", "ACTIVE").order("loaded_at", { ascending: false }).limit(1),
      admin.from("event_paper_snapshots").select("id,paper_required,opening_balance,final_remaining_balance,event_usage,status,format_key,lot,reminder_sent_at").eq("asset_assignment_id", row.id).maybeSingle(),
    ]);
    if (componentError) throw componentError;
    if (lotError) throw lotError;
    if (snapshotError) throw snapshotError;
    const lot = lots?.[0];
    const snapshot = snapshots;
    let reloads = 0;
    if (snapshot?.id) {
      const { data: reloadRows, error: reloadError } = await admin.from("event_paper_reloads").select("quantity").eq("snapshot_id", snapshot.id);
      if (reloadError) throw reloadError;
      reloads = (reloadRows ?? []).reduce((sum, reload) => sum + Number(reload.quantity), 0);
    }
    return { ok: true, roles, assignment: { id: row.id, boxId: row.asset_id, boxCode: box?.asset_code ?? "Caja", boxStatus: box?.status ?? "", assignmentStatus: row.assignment_status, components: (components ?? []).map((component) => ({ id: component.id, code: component.asset_code, type: component.asset_type, status: component.status })), mediaLotId: lot?.id ?? null, mediaRemaining: lot ? Number(lot.remaining_photo_capacity) : null, format: lot?.format_key ?? null, lot: lot?.lot ?? null, paper: snapshot ? { id: snapshot.id, paperRequired: Boolean(snapshot.paper_required), openingBalance: Number(snapshot.opening_balance), reloads, finalRemaining: snapshot.final_remaining_balance === null ? null : Number(snapshot.final_remaining_balance), eventUsage: snapshot.event_usage === null ? null : Number(snapshot.event_usage), status: snapshot.status as StaffPaperStatus, format: snapshot.format_key, lot: snapshot.lot, reminderSentAt: snapshot.reminder_sent_at } : null } };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "No fue posible cargar la Caja asignada." }; }
}

export async function recordStaffBoxCheckOutAction(input: { projectId: string; assignmentId: string; components: StaffComponentInput[] }) {
  try {
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR", "ASSEMBLY"]);
    const key = `staff-box-checkout:${input.projectId}:${input.assignmentId}`;
    const { data, error } = await admin.rpc("record_staff_box_check_out", { p_project_id: input.projectId, p_asset_assignment_id: input.assignmentId, p_components: input.components, p_idempotency_key: key, p_staff_id: staffId, p_portal_session_id: portalSessionId });
    if (error) throw error;
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible registrar el CHECK_OUT." }; }
}

export async function recordStaffBoxCheckInAction(input: { projectId: string; assignmentId: string; mediaLotId: string; remaining: number; components: StaffComponentInput[]; note: string; incident: boolean }) {
  try {
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR", "DISASSEMBLY"]);
    if (!Number.isFinite(input.remaining) || input.remaining < 0) return { ok: false as const, message: "Ingresa un saldo de retorno válido." };
    const key = `staff-box-checkin:${input.projectId}:${input.assignmentId}`;
    const { data, error } = await admin.rpc("record_staff_box_check_in", { p_project_id: input.projectId, p_asset_assignment_id: input.assignmentId, p_media_lot_id: input.mediaLotId, p_remaining_photo_capacity: input.remaining, p_components: input.components, p_note: input.note.trim() || null, p_incident: input.incident, p_idempotency_key: key, p_staff_id: staffId, p_portal_session_id: portalSessionId });
    if (error) throw error;
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible registrar el CHECK_IN." }; }
}

export async function recordStaffPaperReloadAction(input: { projectId: string; assignmentId: string; quantity: number; note: string }) {
  try {
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR"]);
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { ok: false as const, message: "Ingresa una recarga mayor que cero." };
    const { data, error } = await admin.rpc("record_staff_event_paper_reload", { p_project_id: input.projectId, p_asset_assignment_id: input.assignmentId, p_quantity: input.quantity, p_note: input.note.trim() || null, p_idempotency_key: `staff-paper-reload:${input.projectId}:${input.assignmentId}:${input.quantity}`, p_staff_id: staffId, p_portal_session_id: portalSessionId });
    if (error) throw error;
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible registrar la recarga." }; }
}

export async function confirmStaffPaperCloseoutAction(input: { projectId: string; assignmentId: string; finalRemaining: number; note: string }) {
  try {
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR", "DISASSEMBLY"]);
    if (!Number.isFinite(input.finalRemaining) || input.finalRemaining < 0) return { ok: false as const, message: "Ingresa un saldo final válido." };
    const { data, error } = await admin.rpc("confirm_staff_event_paper_closeout", { p_project_id: input.projectId, p_asset_assignment_id: input.assignmentId, p_final_remaining: input.finalRemaining, p_note: input.note.trim() || null, p_idempotency_key: `staff-paper-closeout:${input.projectId}:${input.assignmentId}`, p_staff_id: staffId, p_portal_session_id: portalSessionId });
    if (error) throw error;
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible confirmar el cierre de papel." }; }
}
