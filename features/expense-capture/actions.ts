"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { SupabaseExpenseRepository } from "./infrastructure";
import type { ExpenseCategory } from "./types/expense-capture.types";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function uploadExpenseReceiptAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) throw authError ?? new Error("Sesión requerida.");
    const file = formData.get("receipt");
    if (!(file instanceof File) || !file.size) throw new Error("Selecciona una fotografía del comprobante.");
    if (!allowedTypes.has(file.type)) throw new Error("Usa una imagen JPG, PNG, WEBP o un PDF.");
    if (file.size > 20_971_520) throw new Error("El archivo supera el máximo de 20 MB.");
    const total = Number(formData.get("total"));
    if (!Number.isFinite(total) || total <= 0) throw new Error("Ingresa el monto total del gasto.");
    const occurredOn = String(formData.get("occurredOn") ?? "");
    if (!occurredOn) throw new Error("Ingresa la fecha del gasto.");
    const category = String(formData.get("category") ?? "OTHER") as ExpenseCategory;
    const submittedBy = `${String(formData.get("firstName") ?? "").trim()} ${String(formData.get("lastName") ?? "").trim()}`.trim();
    if (!submittedBy) throw new Error("Ingresa el nombre de quien registra el gasto.");
    const comment = String(formData.get("comment") ?? "").trim();
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${data.user.id}/${occurredOn}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from("orbit-expenses").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    try {
      await new SupabaseExpenseRepository(client).create({
        category,
        occurredOn,
        total,
        currency: "CLP",
        supplier: String(formData.get("supplier") ?? "").trim() || submittedBy,
        receiptPath: path,
        reason: ["Comprobante original cargado manualmente", `Registrado por ${submittedBy}`, comment].filter(Boolean).join(" · "),
      });
    } catch (error) {
      await client.storage.from("orbit-expenses").remove([path]);
      throw error;
    }
    revalidatePath("/finance");
    revalidatePath("/operations");
    return { ok: true, message: "Comprobante guardado. Puedes completar su clasificación más adelante." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible guardar el comprobante." };
  }
}
