"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStaffDocumentArchive } from "./drive-archive.service";
import type {
  FirstFortnightSummary,
  PaymentModality,
  PaymentSchedule,
  StaffPaymentPeriod,
  StaffPeriodPayment,
  StaffPeriodPreview,
} from "./payment-periods.model";

async function adminContext() {
  const client = await createSupabaseServerActionClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Tu sesión expiró.");
  const { data } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!data || !["CEO", "ADMINISTRATOR"].includes(data.role))
    throw new Error("Acceso administrativo requerido.");
  return client;
}
const messageOf = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "No se pudo completar la operación.";
function refreshPeriods() {
  for (const path of [
    "/resources/staff",
    "/staff-portal",
    "/finance/cash-flow",
    "/finance/payables",
    "/reports",
  ])
    revalidatePath(path);
}
export async function getStaffPaymentPeriodsAction(month: string) {
  try {
    const client = await adminContext();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new Error("Mes inválido.");
    const accounts = await client
      .from("staff_monthly_accounts")
      .select("id,staff_id,settlement_status,payment_status,boleta_status")
      .eq("accounting_month", `${month}-01`);
    if (accounts.error) throw accounts.error;
    const ids = (accounts.data ?? []).map((row) => row.id);
    if (!ids.length)
      return {
        ok: true as const,
        summary: [] as FirstFortnightSummary[],
        accounts: [],
        schedules: [],
        periods: [],
        payments: [],
        audit: [],
      };
    const [summary, schedules, periods, audit] = await Promise.all([
      client.rpc("preview_staff_first_fortnight", { p_month: `${month}-01` }),
      client
        .from("staff_payment_schedules")
        .select("account_id,modality,monthly_boleta_validation")
        .in("account_id", ids),
      client
        .from("staff_payment_periods")
        .select("*")
        .in("account_id", ids)
        .order("starts_on"),
      client
        .from("staff_payment_period_audit")
        .select("id,account_id,action,occurred_at,state")
        .in("account_id", ids)
        .order("occurred_at", { ascending: false })
        .limit(200),
    ]);
    for (const result of [summary, schedules, periods, audit])
      if (result.error) throw result.error;
    const periodIds = (periods.data ?? []).map((row) => row.id);
    const payments = periodIds.length
      ? await client
          .from("staff_period_payments")
          .select("*")
          .in("period_id", periodIds)
          .order("created_at")
      : { data: [], error: null };
    if (payments.error) throw payments.error;
    return {
      ok: true as const,
      summary: (summary.data ?? []) as FirstFortnightSummary[],
      accounts: accounts.data ?? [],
      schedules: (schedules.data ?? []) as PaymentSchedule[],
      periods: (periods.data ?? []) as StaffPaymentPeriod[],
      payments: (payments.data ?? []) as StaffPeriodPayment[],
      audit: audit.data ?? [],
    };
  } catch (error) {
    return { ok: false as const, message: messageOf(error) };
  }
}
export async function configureStaffPaymentPeriodsAction(form: FormData) {
  try {
    const client = await adminContext();
    const staffIds = [...new Set(form.getAll("staffIds").map(String))];
    const month = String(form.get("month") ?? "");
    const modality = String(form.get("modality")) as PaymentModality;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !staffIds.length)
      throw new Error("Selecciona mes y trabajadores.");
    const { data, error } = await client.rpc(
      "configure_staff_payment_periods",
      {
        p_staff_ids: staffIds,
        p_month: `${month}-01`,
        p_modality: modality,
        p_tax_validation:
          form.get("taxValidated") === "on"
            ? String(form.get("taxValidation") ?? "")
            : null,
      },
    );
    if (error) throw error;
    refreshPeriods();
    return { ok: true, message: `Modalidad aplicada a ${data} trabajadores.` };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}
export async function previewStaffPaymentPeriodAction(periodId: string) {
  try {
    const client = await adminContext();
    const { data, error } = await client.rpc("preview_staff_payment_period", {
      p_period_id: periodId,
    });
    if (error) throw error;
    return { ok: true as const, preview: data as StaffPeriodPreview };
  } catch (error) {
    return { ok: false as const, message: messageOf(error) };
  }
}
export async function closeStaffPaymentPeriodAction(periodId: string) {
  try {
    const client = await adminContext();
    const { error } = await client.rpc("close_staff_payment_period", {
      p_period_id: periodId,
    });
    if (error) throw error;
    refreshPeriods();
    return {
      ok: true,
      message: "Bloque cerrado con liquidación histórica protegida.",
    };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}
export async function registerStaffPeriodPaymentAction(form: FormData) {
  // Each upload attempt uses a unique object. A failed retry cannot delete a committed receipt.
  let uploadPath = "";
  try {
    const client = await adminContext();
    const periodId = String(form.get("periodId") ?? "");
    const key = String(form.get("idempotencyKey") ?? "");
    const amount = Number(form.get("amount"));
    const file = form.get("file");
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (
      !/^[0-9a-f-]{36}$/i.test(periodId) ||
      !/^[0-9a-f-]{36}$/i.test(key) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 15 * 1024 * 1024 ||
      !allowed.includes(file.type)
    )
      throw new Error(
        "Completa los datos y adjunta un comprobante PDF o imagen de hasta 15 MB.",
      );
    const prior = await client
      .from("staff_period_payments")
      .select("id,period_id,amount,paid_on,method,reference")
      .eq("idempotency_key", key)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      if (
        prior.data.period_id !== periodId ||
        Number(prior.data.amount) !== amount ||
        prior.data.paid_on !== String(form.get("paidOn")) ||
        prior.data.method !== String(form.get("method")).trim() ||
        prior.data.reference !== String(form.get("reference") ?? "")
      )
        throw new Error(
          "La clave de pago pertenece a un movimiento diferente.",
        );
      return { ok: true, message: "Este pago ya estaba registrado." };
    }
    const period = await client
      .from("staff_payment_periods")
      .select("account_id")
      .eq("id", periodId)
      .single();
    if (period.error) throw period.error;
    const account = await client
      .from("staff_monthly_accounts")
      .select("staff_id,accounting_month")
      .eq("id", period.data.account_id)
      .single();
    if (account.error) throw account.error;
    const bytes = await file.arrayBuffer();
    const digest = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex")
      .slice(0, 16);
    uploadPath = `staff/${account.data.staff_id}/05_COMPROBANTES_PAGO/${account.data.accounting_month.slice(0, 7)}/period-${periodId}/${key}-${digest}-${randomUUID()}`;
    const admin = createAdminClient();
    const uploaded = await admin.storage
      .from("orbit-documents")
      .upload(uploadPath, bytes, { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const result = await client.rpc("register_staff_period_payment", {
      p_period_id: periodId,
      p_amount: amount,
      p_paid_on: String(form.get("paidOn")),
      p_method: String(form.get("method") ?? "").trim(),
      p_reference: String(form.get("reference") ?? ""),
      p_idempotency_key: key,
      p_bucket: "orbit-documents",
      p_path: uploadPath,
      p_file_name: file.name,
      p_mime_type: file.type,
    });
    if (result.error) {
      // Leave uncertain outcomes for reconciliation instead of deleting a potentially linked receipt.
      throw result.error;
    }
    uploadPath = "";
    try {
      await syncStaffDocumentArchive(admin, result.data.receipt_document_id);
    } catch {
      /* Receipt is durable in Storage and can use the existing Drive retry flow. */
    }
    refreshPeriods();
    return {
      ok: true,
      message:
        "Pago registrado con comprobante e historial. Honorarios separados de reembolsos.",
    };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function getOwnStaffPaymentPeriodsAction(accountId: string) {
  try {
    const { loadPortalSession } =
      await import("@/features/portal-authentication/portal-auth.service");
    const session = await loadPortalSession("STAFF");
    if (!session?.staff_id) throw new Error("Sesión Staff requerida.");
    const admin = createAdminClient();
    const account = await admin
      .from("staff_monthly_accounts")
      .select("id,staff_id")
      .eq("id", accountId)
      .eq("staff_id", session.staff_id)
      .maybeSingle();
    if (account.error || !account.data)
      throw new Error("Cuenta no disponible.");
    const schedule = await admin
      .from("staff_payment_schedules")
      .select("modality")
      .eq("account_id", accountId)
      .maybeSingle();
    if (schedule.error) throw schedule.error;
    if (!schedule.data)
      return {
        ok: true as const,
        modality: null,
        periods: [] as StaffPaymentPeriod[],
        payments: [] as StaffPeriodPayment[],
      };
    const periods = await admin
      .from("staff_payment_periods")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "FINALIZED")
      .order("starts_on");
    if (periods.error) throw periods.error;
    const ids = (periods.data ?? []).map((row) => row.id);
    const payments = ids.length
      ? await admin
          .from("staff_period_payments")
          .select(
            "id,period_id,amount,paid_on,method,reference,receipt_document_id,created_at",
          )
          .in("period_id", ids)
          .order("created_at")
      : { data: [], error: null };
    if (payments.error) throw payments.error;
    return {
      ok: true as const,
      modality: schedule.data.modality as PaymentModality,
      periods: (periods.data ?? []) as StaffPaymentPeriod[],
      payments: (payments.data ?? []) as StaffPeriodPayment[],
    };
  } catch (error) {
    return { ok: false as const, message: messageOf(error) };
  }
}
