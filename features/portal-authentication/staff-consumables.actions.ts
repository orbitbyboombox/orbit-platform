"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "./portal-auth.service";

export type StaffConsumable = {
  id: string;
  boxAssetId: string;
  boxCode: string;
  printerCode: string | null;
  formatKey: string;
  lot: string;
  loadedAt: string;
  remaining: number;
  threshold: number;
  status: string;
};

async function staffContext(projectId: string) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) throw new Error("Tu sesión expiró.");
  const admin = createAdminClient();
  const { count, error } = await admin.from("assignments").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("staff_id", session.staff_id).in("status", ["CONFIRMED", "ACCEPTED", "COMPLETED"]).is("deleted_at", null);
  if (error) throw error;
  if (!count) throw new Error("No tienes una asignación activa para este Evento.");
  return { admin, staffId: session.staff_id };
}

export async function loadStaffConsumablesAction(projectId: string): Promise<{ ok: true; items: StaffConsumable[] } | { ok: false; message: string }> {
  try {
    const { admin } = await staffContext(projectId);
    const { data: assignments, error: assignmentError } = await admin.from("asset_assignments").select("asset_id").eq("project_id", projectId).in("assignment_status", ["ASSIGNED", "CONFIRMED", "ACCEPTED", "IN_EVENT"]).is("deleted_at", null);
    if (assignmentError) throw assignmentError;
    const boxIds = (assignments ?? []).map((row) => row.asset_id);
    if (!boxIds.length) return { ok: true, items: [] };
    const { data: lots, error: lotError } = await admin.from("box_media_lots").select("id,box_asset_id,printer_asset_id,format_key,lot,loaded_at,remaining_photo_capacity,low_stock_threshold,status").in("box_asset_id", boxIds).neq("status", "DISCARDED").order("loaded_at", { ascending: false });
    if (lotError) throw lotError;
    const assetIds = [...new Set((lots ?? []).flatMap((lot) => [lot.box_asset_id, lot.printer_asset_id].filter(Boolean)))];
    const { data: assets, error: assetError } = assetIds.length ? await admin.from("operational_assets").select("id,asset_code").in("id", assetIds) : { data: [], error: null };
    if (assetError) throw assetError;
    const codes = new Map((assets ?? []).map((asset) => [asset.id, asset.asset_code]));
    return { ok: true, items: (lots ?? []).map((lot) => ({ id: lot.id, boxAssetId: lot.box_asset_id, boxCode: codes.get(lot.box_asset_id) ?? "Caja", printerCode: lot.printer_asset_id ? codes.get(lot.printer_asset_id) ?? null : null, formatKey: lot.format_key, lot: lot.lot, loadedAt: lot.loaded_at, remaining: Number(lot.remaining_photo_capacity), threshold: Number(lot.low_stock_threshold), status: lot.status })) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible cargar los consumibles." };
  }
}

export async function recordStaffConsumableReturnAction(input: { projectId: string; mediaLotId: string; remaining: number; note: string; incident: boolean }) {
  try {
    const { admin, staffId } = await staffContext(input.projectId);
    if (!Number.isFinite(input.remaining) || input.remaining < 0) return { ok: false, message: "Ingresa un saldo de retorno válido." };
    const idempotencyKey = `staff-media-return:${input.projectId}:${input.mediaLotId}:${input.remaining}`;
    const { data, error } = await admin.rpc("record_staff_box_media_return", { p_project_id: input.projectId, p_media_lot_id: input.mediaLotId, p_remaining_photo_capacity: input.remaining, p_note: input.note.trim() || null, p_incident_flag: input.incident, p_idempotency_key: idempotencyKey, p_staff_id: staffId });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/staff-portal");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible registrar el retorno." };
  }
}
