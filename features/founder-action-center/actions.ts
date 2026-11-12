"use server";
import { validateFounderActions } from "./diagnostic.actions";
// Retain the existing callable name, but never hide an unresolved source.
export async function dismissFounderActionsAction(actionKeys: string[]) {
  return validateFounderActions(actionKeys);
}

import { requireDiagnosticAdmin, loadActionDiagnostic } from "./diagnostics.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/** Acknowledges an alert for this admin only; never resolves its canonical source. */
export async function acknowledgeFounderAction(id: string) {
  try {
    if (!id || id.length > 200) throw new Error("Pendiente inválido.");
    const { userId } = await requireDiagnosticAdmin();
    await loadActionDiagnostic(id); // Ensure this is an existing accessible action.
    const admin = createAdminClient();
    const { error } = await admin.from("founder_action_user_states").upsert({
      user_id: userId, action_key: id, dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,action_key" });
    if (error) throw error;
    revalidatePath("/");
    revalidatePath("/operations");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible registrar la revisión." };
  }
}
