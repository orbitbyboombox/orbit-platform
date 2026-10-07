"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "./portal-auth.service";
import { reportStaffOperatorIncidentAction } from "./staff-portal.actions";

export type StaffBoxComponent = { id: string; code: string; type: string; status: string };
export type StaffPaperStatus = "PENDING" | "READY_TO_CLOSE" | "CONFIRMED" | "OVERRIDDEN";
export type StaffPaperSnapshot = { id: string; paperRequired: boolean; openingBalance: number; reloads: number; finalRemaining: number | null; eventUsage: number | null; status: StaffPaperStatus; format: string | null; variant: "NORMAL_4X6" | "PRECUT_4X6" | null; lot: string | null; reminderSentAt: string | null; confirmedBy: string | null; confirmedAt: string | null; masterVersionBefore: number | null; masterVersionAfter: number | null };
export type StaffOperationalTurn = { assignmentId: string; blockId: string; blockName: string; sequence: number; startAt: string; endAt: string; status: string };
export type StaffBoxAssignment = { id: string; boxId: string; boxCode: string; boxStatus: string; assignmentStatus: string; components: StaffBoxComponent[]; mediaLotId: string | null; mediaRemaining: number | null; format: string | null; lot: string | null; paper: StaffPaperSnapshot | null; canFinalizeEvent: boolean; turns: StaffOperationalTurn[] };
type StaffComponentInput = { componentId: string; status: string; notes?: string; incident?: boolean };

async function staffContext(projectId: string, allowedRoles?: string[]) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) throw new Error("Tu sesión expiró.");
  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin.from("staff").select("id,status,portal_enabled,deleted_at").eq("id", session.staff_id).maybeSingle();
  if (staffError) throw staffError;
  if (!staff || staff.status !== "ACTIVE" || !staff.portal_enabled || staff.deleted_at) throw new Error("Tu acceso operacional ya no está habilitado.");
  const activeStatuses = ["CONFIRMED", "ACCEPTED", "COMPLETED"];
  const [{ data, error }, { data: allAssignments, error: allAssignmentsError }] = await Promise.all([
    admin.from("assignments").select("id,assignment_type,block_id,status").eq("project_id", projectId).eq("staff_id", session.staff_id).in("status", activeStatuses).is("deleted_at", null),
    admin.from("assignments").select("assignment_type,block_id,staff_id").eq("project_id", projectId).in("status", activeStatuses).is("deleted_at", null),
  ]);
  if (error) throw error;
  if (allAssignmentsError) throw allAssignmentsError;
  const roles = (data ?? []).map((row) => row.assignment_type);
  if (!roles.length || (allowedRoles && !roles.some((role) => allowedRoles.includes(role)))) throw new Error("No tienes la responsabilidad operacional requerida para este paso.");
  const operatorAssignments = (allAssignments ?? []).filter((row) => row.assignment_type === "OPERATOR");
  const ownOperatorAssignments = (data ?? []).filter((row) => row.assignment_type === "OPERATOR");
  const blockIds = operatorAssignments.map((row) => row.block_id).filter((id): id is string => Boolean(id));
  const { data: blocks, error: blockError } = blockIds.length
    ? await admin.from("event_operational_blocks").select("id,sequence").in("id", blockIds)
    : { data: [], error: null };
  if (blockError) throw blockError;
  const sequenceByBlock = new Map((blocks ?? []).map((block) => [block.id, Number(block.sequence)]));
  const operatorSequences = operatorAssignments.map((row) => row.block_id ? sequenceByBlock.get(row.block_id) : null).filter((sequence): sequence is number => sequence !== undefined && Number.isFinite(sequence));
  const highestOperatorSequence = operatorSequences.length ? Math.max(...operatorSequences) : null;
  const canFinalizeEvent = roles.includes("DISASSEMBLY")
    || ownOperatorAssignments.some((row) => !row.block_id || sequenceByBlock.get(row.block_id) === highestOperatorSequence);
  return { admin, staffId: session.staff_id, portalSessionId: session.id, roles, canFinalizeEvent, ownOperatorAssignments, sequenceByBlock };
}

export async function loadStaffBoxOperationsAction(projectId: string): Promise<{ ok: true; assignment: StaffBoxAssignment; roles: string[] } | { ok: false; message: string }> {
  try {
    const { admin, roles, canFinalizeEvent, ownOperatorAssignments } = await staffContext(projectId);
    const blockIds = ownOperatorAssignments.map((row) => row.block_id).filter((id): id is string => Boolean(id));
    const { data: blockRows, error: ownBlockError } = blockIds.length
      ? await admin.from("event_operational_blocks").select("id,name,sequence,start_at,end_at").in("id", blockIds)
      : { data: [], error: null };
    if (ownBlockError) throw ownBlockError;
    const ownBlocks = new Map((blockRows ?? []).map((block) => [block.id, block]));
    const turns = ownOperatorAssignments.flatMap((row) => {
      if (!row.block_id) return [];
      const block = ownBlocks.get(row.block_id);
      return block ? [{ assignmentId: row.id, blockId: block.id, blockName: block.name, sequence: Number(block.sequence), startAt: block.start_at, endAt: block.end_at, status: row.status }] : [];
    }).sort((a, b) => a.sequence - b.sequence);
    const { data: rows, error } = await admin.from("asset_assignments").select("id,asset_id,assignment_status,operational_assets!inner(id,asset_code,status,asset_type)").eq("project_id", projectId).eq("assignment_status", "ASSIGNED").is("deleted_at", null).in("operational_assets.asset_type", ["BOX", "CASE"]).in("operational_assets.asset_code", ["CASE-01", "CASE-02", "CASE-03", "CASE-04", "CASE-05", "CASE-06", "CASE-07", "CASE-08", "CASE-09"]).limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (!row) return { ok: true, roles, assignment: { id: "", boxId: "", boxCode: "", boxStatus: "", assignmentStatus: "", components: [], mediaLotId: null, mediaRemaining: null, format: null, lot: null, paper: null, canFinalizeEvent, turns } };
    const box = Array.isArray(row.operational_assets) ? row.operational_assets[0] : row.operational_assets;
    // Future Events can receive their paper snapshot before the previous Event using
    // the same Box is closed. Rebase only a still-pending snapshot when the current
    // Master stock is explained by the last confirmed close of this Box.
    const { error: rebaseError } = await admin.rpc("rebase_pending_event_paper_snapshot", {
      p_project_id: projectId,
      p_asset_assignment_id: row.id,
    });
    if (rebaseError) throw rebaseError;
    const [{ data: components, error: componentError }, { data: lots, error: lotError }, { data: snapshots, error: snapshotError }] = await Promise.all([
      admin.from("operational_assets").select("id,asset_code,asset_type,status").eq("parent_asset_id", row.asset_id).is("deleted_at", null).order("asset_code"),
      admin.from("box_media_lots").select("id,remaining_photo_capacity,format_key,lot").eq("box_asset_id", row.asset_id).eq("status", "ACTIVE").order("loaded_at", { ascending: false }).limit(1),
      admin.from("event_paper_snapshots").select("id,paper_required,opening_balance,final_remaining_balance,event_usage,status,format_key,paper_variant,lot,reminder_sent_at,confirmed_by,confirmed_at,master_asset_version_before,master_asset_version_after,black_box_paper_format").eq("asset_assignment_id", row.id).maybeSingle(),
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
    return { ok: true, roles, assignment: { id: row.id, boxId: row.asset_id, boxCode: box?.asset_code ?? "Caja", boxStatus: box?.status ?? "", assignmentStatus: row.assignment_status, components: (components ?? []).map((component) => ({ id: component.id, code: component.asset_code, type: component.asset_type, status: component.status })), mediaLotId: lot?.id ?? null, mediaRemaining: lot ? Number(lot.remaining_photo_capacity) : null, format: lot?.format_key ?? (snapshot as { black_box_paper_format?: string | null } | null)?.black_box_paper_format ?? null, lot: lot?.lot ?? null, paper: snapshot ? { id: snapshot.id, paperRequired: Boolean(snapshot.paper_required), openingBalance: Number(snapshot.opening_balance), reloads, finalRemaining: snapshot.final_remaining_balance === null ? null : Number(snapshot.final_remaining_balance), eventUsage: snapshot.event_usage === null ? null : Number(snapshot.event_usage), status: snapshot.status as StaffPaperStatus, format: snapshot.format_key ?? (snapshot as { black_box_paper_format?: string | null }).black_box_paper_format ?? null, variant: snapshot.paper_variant === "NORMAL_4X6" || snapshot.paper_variant === "PRECUT_4X6" ? snapshot.paper_variant : null, lot: snapshot.lot, reminderSentAt: snapshot.reminder_sent_at, confirmedBy: snapshot.confirmed_by ?? null, confirmedAt: snapshot.confirmed_at ?? null, masterVersionBefore: snapshot.master_asset_version_before ?? null, masterVersionAfter: snapshot.master_asset_version_after ?? null } : null, canFinalizeEvent, turns } };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "No fue posible cargar la Caja asignada." }; }
}

export async function finalizeStaffOperationalTurnAction(input: { projectId: string; assignmentId: string; blockId: string }) {
  try {
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR"]);
    const { data, error } = await admin.rpc("finalize_staff_operational_turn", {
      p_project_id: input.projectId,
      p_assignment_id: input.assignmentId,
      p_block_id: input.blockId,
      p_staff_id: staffId,
      p_portal_session_id: portalSessionId,
      p_idempotency_key: `staff-turn-finalize:${input.assignmentId}`,
    });
    if (error) throw error;
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible finalizar tu turno." };
  }
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
    const { admin, staffId, portalSessionId } = await staffContext(input.projectId, ["OPERATOR"]);
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
    if (error) return { ok: false as const, message: error.message || "No fue posible confirmar el cierre de papel." };
    revalidatePath("/staff-portal");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible confirmar el cierre de papel." }; }
}

export async function finalizeStaffPaperCloseoutAction(input: { projectId: string; assignmentId: string; finalRemaining: number; usedSparePaper: boolean; issue: string }) {
  const issue = input.issue.trim();
  const note = `Papel de repuesto: ${input.usedSparePaper ? "SÍ" : "NO"}${issue ? `\nReporte Staff: ${issue}` : ""}`;
  const closeout = await confirmStaffPaperCloseoutAction({ ...input, note });
  if (!closeout.ok || !issue) return closeout;
  const incident = await reportStaffOperatorIncidentAction({ projectId: input.projectId, category: "EQUIPMENT", severity: "HIGH", description: issue });
  if (!incident.ok) return { ok: false as const, message: `Cierre registrado, pero no se pudo crear la alerta: ${incident.message}` };
  return closeout;
}
