"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceAssetMapping = {
  id: string;
  serviceCode: string;
  assetType: string;
  unitsPerService: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  enabled: boolean;
  version: number;
};

type Result = { ok: boolean; message: string };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

async function context() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Tu sesión no está disponible.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (profileError) throw profileError;
  if (!["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder o Administración puede configurar estas relaciones.");
  return { client, userId: data.user.id };
}

export async function saveServiceAssetMappingAction(data: FormData): Promise<Result> {
  try {
    const { client, userId } = await context();
    const id = text(data, "id");
    const serviceCode = text(data, "serviceCode").toUpperCase();
    const assetType = text(data, "assetType").toUpperCase();
    const unitsPerService = Number(data.get("unitsPerService"));
    const bufferBeforeMinutes = Number(data.get("bufferBeforeMinutes"));
    const bufferAfterMinutes = Number(data.get("bufferAfterMinutes"));
    const enabled = data.get("enabled") === "on";
    if (!serviceCode || !assetType || !Number.isFinite(unitsPerService) || unitsPerService <= 0) throw new Error("Completa servicio, tipo y unidades requeridas.");
    if (![bufferBeforeMinutes, bufferAfterMinutes].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("Los buffers deben ser minutos enteros iguales o mayores a cero.");
    if (id) {
      const version = Number(data.get("version"));
      const { data: updated, error } = await client.from("service_asset_type_mappings").update({ units_per_service: unitsPerService, buffer_before_minutes: bufferBeforeMinutes, buffer_after_minutes: bufferAfterMinutes, enabled, updated_by: userId }).eq("id", id).eq("version", version).select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("La configuración cambió en otra sesión. Recarga e inténtalo nuevamente.");
    } else {
      const { error } = await client.from("service_asset_type_mappings").insert({ service_code: serviceCode, asset_type: assetType, units_per_service: unitsPerService, buffer_before_minutes: bufferBeforeMinutes, buffer_after_minutes: bufferAfterMinutes, enabled, created_by: userId, updated_by: userId });
      if (error) throw error;
    }
    revalidatePath("/resources");
    revalidatePath("/operations");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "Relación servicio–recurso actualizada." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible guardar la relación." };
  }
}
