"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { MASTER_BLACK_BOX_CODES, BLACK_BOX_PAPER_FORMATS } from "./box-inventory";

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const allowedStatuses = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
type MasterStatus = (typeof allowedStatuses)[number];
type PaperFormat = (typeof BLACK_BOX_PAPER_FORMATS)[number]["key"];

export async function updateBlackBoxMasterAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!(["CEO", "ADMINISTRATOR"] as string[]).includes(profile.role)) throw new Error("Solo Master Admin puede editar las Cajas Negras.");

    const id = text(formData.get("id"));
    const assetCode = text(formData.get("assetCode"));
    const version = Number(text(formData.get("version")));
    const photoStock = Number(text(formData.get("photoStock")));
    const paperFormat = text(formData.get("paperFormat")) as PaperFormat;
    const status = text(formData.get("status")) as MasterStatus;
    if (!id || !MASTER_BLACK_BOX_CODES.includes(assetCode) || !Number.isInteger(version)) throw new Error("Caja inválida o desactualizada.");
    if (!Number.isInteger(photoStock) || photoStock < 0) throw new Error("El stock debe ser un número entero igual o mayor que cero.");
    if (!BLACK_BOX_PAPER_FORMATS.some((format) => format.key === paperFormat)) throw new Error("Formato de papel inválido.");
    if (!allowedStatuses.includes(status)) throw new Error("Estado de Caja inválido.");

    const { data: current, error: currentError } = await client
      .from("operational_assets")
      .select("id,asset_code,asset_type,metadata")
      .eq("id", id)
      .eq("asset_code", assetCode)
      .eq("asset_type", "CASE")
      .is("deleted_at", null)
      .single();
    if (currentError) throw currentError;
    const metadata = (current.metadata ?? {}) as Record<string, unknown>;
    const { data, error } = await client
      .from("operational_assets")
      .update({
        metadata: { ...metadata, blackBoxPhotoStock: photoStock, blackBoxPaperFormat: paperFormat },
        status,
        updated_by: auth.user.id,
      })
      .eq("id", id)
      .eq("version", version)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("La Caja cambió en otra sesión. Recarga el Master e inténtalo nuevamente.");
    revalidatePath("/resources/boxes");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible guardar la Caja Negra." };
  }
}
