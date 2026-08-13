"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const friendly = (error: unknown, fallback: string) => error instanceof Error && !/violates|constraint|postgres|supabase|invalid input/i.test(error.message) ? error.message : fallback;

async function context() {
  const client = await createSupabaseServerActionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Administración puede gestionar pagos de Staff.");
  return { client };
}

function revalidateSettlement(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/resources/staff");
  revalidatePath("/operations");
  revalidatePath("/staff-portal");
  revalidatePath("/finance");
  revalidatePath("/finance/cash-flow");
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function overrideStaffEventPaymentAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId");
    const reason = text(data, "reason");
    const target = Math.max(0, Number(data.get("eventNet")));
    if (!paymentId || !reason || !Number.isFinite(target)) throw new Error("Ingresa el neto del Evento y el motivo.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id,operator_payment,assembly_payment,disassembly_payment").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    let operator = Number(payment.operator_payment), assembly = Number(payment.assembly_payment), disassembly = Number(payment.disassembly_payment);
    if (operator > 0) operator = Math.max(0, target - assembly - disassembly);
    else if (assembly > 0) assembly = Math.max(0, target - disassembly);
    else disassembly = target;
    const { error } = await client.rpc("set_staff_payment_override", { p_payment_id: paymentId, p_operator: operator, p_assembly: assembly, p_disassembly: disassembly, p_reason: reason });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible ajustar el pago operacional.") };
  }
}

export async function updateStaffEventSettlementAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId"), movementType = text(data, "movementType"), receiptStatus = text(data, "receiptStatus");
    const amount = Math.max(0, Number(data.get("movementAmount")));
    if (!paymentId || !amount) throw new Error("Ingresa el nuevo movimiento de pago.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await client.rpc("register_staff_settlement_movement", { p_settlement_id: paymentId, p_type: movementType, p_amount: amount, p_date: text(data, "paidAt") || null, p_method: text(data,"method"), p_notes: text(data,"notes") });
    if (error) throw error;
    const{error:receiptError}=await client.rpc("update_staff_settlement_receipt",{p_settlement_id:paymentId,p_receipt_status:receiptStatus});if(receiptError)throw receiptError;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible actualizar el pago del evento.") };
  }
}
