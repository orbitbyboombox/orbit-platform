"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ServiceExtraCode } from "./types";

const SERVICE_EXTRAS: readonly ServiceExtraCode[] = ["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"];

type ServiceInput = {
  id?: string; priceId?: string | null; expectedVersion?: number; expectedPriceVersion?: number | null;
  code: string; name: string; category: string; basePrice: number | null; minimumHours: number; maximumHours: number;
  additionalHourPrice: number | null; enabled: boolean; displayOrder: number; description: string;
  compatibleExtras: ServiceExtraCode[]; defaultExtras: ServiceExtraCode[]; behavior: string; reason: string;
};

async function administratorContext() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const profile = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile.error) throw profile.error;
  if (!["CEO","ADMINISTRATOR"].includes(profile.data?.role ?? "")) throw new Error("Esta acción requiere permisos de Administrador.");
  return { client, userId: auth.user.id };
}

function normalized(input: ServiceInput) {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_|_$/g,"");
  if (!code || !input.name.trim() || !input.category.trim()) throw new Error("Completa nombre, código y categoría.");
  if (input.minimumHours < 1 || input.maximumHours < input.minimumHours) throw new Error("El rango de horas no es válido.");
  if (input.basePrice !== null && input.basePrice < 0) throw new Error("El precio base no puede ser negativo.");
  if (input.additionalHourPrice !== null && input.additionalHourPrice < 0) throw new Error("El valor de hora adicional no puede ser negativo.");
  if (!input.reason.trim()) throw new Error("La razón del cambio es obligatoria.");
  const compatibleExtras = input.compatibleExtras.filter((item) => SERVICE_EXTRAS.includes(item));
  const defaultExtras = input.defaultExtras.filter((item) => compatibleExtras.includes(item));
  return { ...input, code, compatibleExtras, defaultExtras };
}

function serviceConfiguration(input: ReturnType<typeof normalized>) {
  return { category: input.category.trim(), description: input.description.trim(), minimumHours: input.minimumHours, maximumHours: input.maximumHours, additionalHourPrice: input.additionalHourPrice, compatibleExtras: input.compatibleExtras, defaultExtras: input.defaultExtras, behavior: input.behavior };
}

export async function createServiceAction(raw: ServiceInput) {
  try {
    const input = normalized(raw); const { client, userId } = await administratorContext();
    const entry = await client.from("master_data_entries").insert({ domain:"SERVICES", code:input.code, label:input.name.trim(), enabled:input.enabled, display_order:input.displayOrder, configuration:serviceConfiguration(input), approval_reason:input.reason.trim(), created_by:userId, updated_by:userId }).select("id").single();
    if (entry.error) throw entry.error;
    const price = await client.from("commercial_prices").insert({ category:"SERVICE", code:input.code, label:input.name.trim(), duration_hours:input.minimumHours, unit_price:input.basePrice, pricing_status:input.basePrice === null ? "REQUIRES_QUOTE" : "DEFINED", enabled:input.enabled, display_order:input.displayOrder, rules:{ minimumHours:input.minimumHours, maximumHours:input.maximumHours, additionalHourPrice:input.additionalHourPrice, compatibleExtras:input.compatibleExtras, defaultExtras:input.defaultExtras, behavior:input.behavior }, approval_reason:input.reason.trim(), created_by:userId, updated_by:userId }).select("id").single();
    if (price.error) { await client.from("master_data_entries").delete().eq("id",entry.data.id); throw price.error; }
    revalidatePath("/settings"); revalidatePath("/projects");
    return { ok:true as const };
  } catch (error) { return { ok:false as const, error:error instanceof Error ? error.message : "No fue posible crear el servicio." }; }
}

export async function updateServiceAction(raw: ServiceInput) {
  try {
    const input = normalized(raw); if (!input.id || input.expectedVersion == null) throw new Error("Servicio inválido.");
    const { client, userId } = await administratorContext();
    const entry = await client.from("master_data_entries").update({ code:input.code, label:input.name.trim(), enabled:input.enabled, display_order:input.displayOrder, configuration:serviceConfiguration(input), approval_reason:input.reason.trim(), updated_by:userId }).eq("id",input.id).eq("version",input.expectedVersion).select("id").maybeSingle();
    if (entry.error) throw entry.error; if (!entry.data) throw new Error("El servicio cambió en otra sesión. Recarga la página.");
    const priceValues = { code:input.code, label:input.name.trim(), duration_hours:input.minimumHours, unit_price:input.basePrice, pricing_status:input.basePrice === null ? "REQUIRES_QUOTE" : "DEFINED", enabled:input.enabled, display_order:input.displayOrder, rules:{ minimumHours:input.minimumHours, maximumHours:input.maximumHours, additionalHourPrice:input.additionalHourPrice, compatibleExtras:input.compatibleExtras, defaultExtras:input.defaultExtras, behavior:input.behavior }, approval_reason:input.reason.trim(), updated_by:userId };
    if (input.priceId) {
      let query = client.from("commercial_prices").update(priceValues).eq("id",input.priceId);
      if (input.expectedPriceVersion != null) query = query.eq("version",input.expectedPriceVersion);
      const price = await query.select("id").maybeSingle(); if (price.error) throw price.error; if (!price.data) throw new Error("El precio cambió en otra sesión. Recarga la página.");
    } else {
      const price = await client.from("commercial_prices").insert({ ...priceValues, category:"SERVICE", created_by:userId }).select("id").single(); if (price.error) throw price.error;
    }
    await client.from("commercial_prices").update({ enabled:input.enabled, display_order:input.displayOrder, approval_reason:input.reason.trim(), updated_by:userId }).eq("category","SERVICE").eq("code",raw.code).neq("id",input.priceId ?? "00000000-0000-0000-0000-000000000000");
    revalidatePath("/settings"); revalidatePath("/projects"); return { ok:true as const };
  } catch (error) { return { ok:false as const, error:error instanceof Error ? error.message : "No fue posible actualizar el servicio." }; }
}

export async function setServiceEnabledAction(input: { id:string; code:string; enabled:boolean; expectedVersion:number; reason:string }) {
  try {
    if (!input.reason.trim()) throw new Error("La razón del cambio es obligatoria."); const { client, userId } = await administratorContext();
    const entry = await client.from("master_data_entries").update({ enabled:input.enabled, approval_reason:input.reason.trim(), updated_by:userId }).eq("id",input.id).eq("version",input.expectedVersion).select("id").maybeSingle();
    if (entry.error) throw entry.error; if (!entry.data) throw new Error("El servicio cambió en otra sesión. Recarga la página.");
    const prices = await client.from("commercial_prices").update({ enabled:input.enabled, approval_reason:input.reason.trim(), updated_by:userId }).eq("category","SERVICE").eq("code",input.code).is("deleted_at",null); if (prices.error) throw prices.error;
    revalidatePath("/settings"); revalidatePath("/projects"); return { ok:true as const };
  } catch (error) { return { ok:false as const, error:error instanceof Error ? error.message : "No fue posible cambiar el estado." }; }
}

export async function deleteServiceAction(input: { id:string; code:string; expectedVersion:number; reason:string }) {
  try {
    if (!input.reason.trim()) throw new Error("La razón del cambio es obligatoria."); const { client, userId } = await administratorContext();
    const prices = await client.from("commercial_prices").update({ enabled:false, deleted_at:new Date().toISOString(), deleted_by:userId, approval_reason:input.reason.trim(), updated_by:userId }).eq("category","SERVICE").eq("code",input.code).is("deleted_at",null); if (prices.error) throw prices.error;
    const entry = await client.from("master_data_entries").delete().eq("id",input.id).eq("version",input.expectedVersion).select("id").maybeSingle(); if (entry.error) throw entry.error; if (!entry.data) throw new Error("El servicio cambió en otra sesión. Recarga la página.");
    revalidatePath("/settings"); revalidatePath("/projects"); return { ok:true as const };
  } catch (error) { return { ok:false as const, error:error instanceof Error ? error.message : "No fue posible eliminar el servicio." }; }
}

export async function updateMasterDataAction(input: { id: string; source: "MASTER" | "COMMERCIAL"; enabled: boolean; displayOrder: number; price?: number | null; configuration?: string; reason: string; expectedVersion: number }) {
  try {
    if (!input.reason.trim()) throw new Error("La razón del cambio es obligatoria.");
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const table = input.source === "MASTER" ? "master_data_entries" : "commercial_prices";
    const values: Record<string, unknown> = { enabled: input.enabled, display_order: input.displayOrder, approval_reason: input.reason.trim(), updated_by: auth.user.id };
    if (input.source === "COMMERCIAL") values.unit_price = input.price;
    if (input.source === "MASTER") {
      try { values.configuration = JSON.parse(input.configuration || "{}"); }
      catch { throw new Error("La configuración debe usar un formato JSON válido."); }
    }
    const { data, error } = await client.from(table).update(values).eq("id", input.id).eq("version", input.expectedVersion).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("El registro cambió en otra sesión. Recarga la página.");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible guardar el cambio." };
  }
}
