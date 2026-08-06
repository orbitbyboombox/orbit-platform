"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
