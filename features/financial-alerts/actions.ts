"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export async function markFinancialAlertPaidAction(id: string) {
  try {
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("mark_financial_alert_paid", { p_obligation_id: id });
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/notifications");
    return { ok: true as const, message: "IVA marcado como pagado y auditado." };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible registrar el pago." };
  }
}
