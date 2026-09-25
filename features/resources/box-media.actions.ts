"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const number = (value: FormDataEntryValue | null) => Number(text(value));

async function context() {
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Sesión requerida.");
  const { data: profile, error } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (error) throw error;
  if (!["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Administración puede gestionar consumibles.");
  return { userId: auth.user.id };
}

export async function createBoxMediaLotAction(formData: FormData): Promise<void> {
  try {
    const { userId } = await context();
    const boxAssetId = text(formData.get("boxAssetId"));
    const supplyId = text(formData.get("supplyId"));
    const printerAssetId = text(formData.get("printerAssetId")) || null;
    const formatKey = text(formData.get("formatKey"));
    const lot = text(formData.get("lot"));
    const initial = number(formData.get("initialCapacity"));
    const threshold = number(formData.get("lowStockThreshold")) || 100;
    if (!boxAssetId || !supplyId || !formatKey || !lot || !Number.isFinite(initial) || initial <= 0) throw new Error("Completa formato, lote y capacidad inicial.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_box_media_lot_with_load", { p_supply_id: supplyId, p_box_asset_id: boxAssetId, p_printer_asset_id: printerAssetId, p_format_key: formatKey, p_lot: lot, p_loaded_at: new Date().toISOString(), p_initial_capacity: initial, p_low_stock_threshold: threshold, p_notes: text(formData.get("notes")) || null, p_actor_id: userId });
    if (error) throw error;
    void data;
    revalidatePath(`/resources/boxes/${boxAssetId}`);
  } catch (error) {
    console.error("box media load failed", error instanceof Error ? error.message : "unknown error");
  }
}

export async function recordBoxMediaMovementAction(formData: FormData): Promise<void> {
  try {
    const { userId } = await context();
    const delta = number(formData.get("quantityDelta"));
    const type = text(formData.get("movementType"));
    if (!text(formData.get("mediaLotId")) || !["EVENT_USAGE", "MANUAL_ADJUSTMENT", "RETURN", "DISCARD"].includes(type) || !Number.isFinite(delta) || delta === 0) throw new Error("Movimiento de consumible inválido.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("apply_box_media_movement", { p_media_lot_id: text(formData.get("mediaLotId")), p_movement_type: type, p_quantity_delta: delta, p_occurred_at: new Date().toISOString(), p_reason: text(formData.get("reason")) || "Movimiento operativo", p_project_id: text(formData.get("projectId")) || null, p_orbit_event_id: text(formData.get("orbitEventId")) || null, p_staff_id: text(formData.get("staffId")) || null, p_actor_id: userId });
    if (error) throw error;
    void data;
    const { data: lot } = await admin.from("box_media_lots").select("box_asset_id").eq("id", text(formData.get("mediaLotId"))).maybeSingle();
    if (lot?.box_asset_id) revalidatePath(`/resources/boxes/${lot.box_asset_id}`);
  } catch (error) {
    console.error("box media movement failed", error instanceof Error ? error.message : "unknown error");
  }
}
