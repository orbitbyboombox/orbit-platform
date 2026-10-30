"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

async function adminContext() {
  const client = await createSupabaseServerActionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Acceso administrativo requerido.");
  return client;
}

function selectedFile(form: FormData, field: string) {
  const file = form.get(field);
  if (!(file instanceof File) || !file.size || !allowed.has(file.type) || file.size > 15 * 1024 * 1024) {
    throw new Error("Adjunta un PDF o imagen de hasta 15 MB.");
  }
  return file;
}

function fail(error: unknown) {
  const ref = randomUUID().slice(0, 8).toUpperCase();
  console.error(JSON.stringify({ event: "staff_complementary_settlement_failed", ref, code: error instanceof Error ? error.name : "ERROR" }));
  return { ok: false, message: "No fue posible completar la operación. Referencia " + ref + "." };
}

const refresh = () => {
  revalidatePath("/resources/staff");
  revalidatePath("/staff-portal");
};

export async function createComplementarySettlementAction(form: FormData) {
  try {
    const client = await adminContext();
    const { error } = await client.rpc("create_staff_complementary_settlement", {
      p_settlement_id: String(form.get("settlementId") ?? ""),
      p_reason: String(form.get("reason") ?? ""),
    });
    if (error) throw error;
    refresh();
    return { ok: true, message: "Liquidación complementaria creada en estado PENDIENTE." };
  } catch (error) { return fail(error); }
}

export async function submitComplementaryBoletaAction(form: FormData) {
  let path = "";
  try {
    const client = await adminContext();
    const id = String(form.get("settlementId") ?? "");
    const issueDate = String(form.get("issueDate") ?? "");
    const file = selectedFile(form, "file");
    const { data: row, error: rowError } = await client.from("staff_complementary_settlements").select("staff_id,event_date").eq("id", id).single();
    if (rowError || !row) throw rowError ?? new Error("Liquidación no encontrada.");
    const bytes = await file.arrayBuffer();
    const key = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    path = "staff/" + row.staff_id + "/04_LIQUIDACIONES_COMPLEMENTARIAS/" + row.event_date + "/" + id + "-" + key + "-" + file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const admin = createAdminClient();
    const upload = await admin.storage.from("orbit-documents").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await client.rpc("submit_staff_complementary_boleta", {
      p_settlement_id: id, p_bucket: "orbit-documents", p_path: path,
      p_file_name: file.name, p_mime_type: file.type, p_issue_date: issueDate,
    });
    if (error) { await admin.storage.from("orbit-documents").remove([path]); throw error; }
    refresh();
    return { ok: true, message: "Boleta recibida y pendiente de revisión." };
  } catch (error) {
    if (path) await createAdminClient().storage.from("orbit-documents").remove([path]);
    return fail(error);
  }
}

export async function reviewComplementaryBoletaAction(form: FormData) {
  try {
    const client = await adminContext();
    const { error } = await client.rpc("review_staff_complementary_boleta", {
      p_settlement_id: String(form.get("settlementId") ?? ""),
      p_action: String(form.get("action") ?? ""),
      p_reason: String(form.get("reason") ?? ""),
    });
    if (error) throw error;
    refresh();
    return { ok: true, message: String(form.get("action")) === "APPROVE" ? "Boleta aprobada; pago habilitado." : "Boleta rechazada." };
  } catch (error) { return fail(error); }
}

export async function registerComplementaryPaymentAction(form: FormData) {
  let path = "";
  try {
    const client = await adminContext();
    const id = String(form.get("settlementId") ?? "");
    const file = selectedFile(form, "file");
    const { data: row, error: rowError } = await client.from("staff_complementary_settlements").select("staff_id,event_date,net_amount").eq("id", id).single();
    if (rowError || !row) throw rowError ?? new Error("Liquidación no encontrada.");
    const amount = Number(form.get("amount"));
    if (amount !== Number(row.net_amount)) throw new Error("El monto no coincide con la liquidación congelada.");
    const bytes = await file.arrayBuffer();
    const key = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    path = "staff/" + row.staff_id + "/05_COMPROBANTES_PAGO/" + row.event_date + "/" + id + "-" + key + "-" + file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const admin = createAdminClient();
    const upload = await admin.storage.from("orbit-documents").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await client.rpc("register_staff_complementary_payment", {
      p_settlement_id: id, p_payment_date: String(form.get("paymentDate") ?? ""),
      p_amount: amount, p_method: String(form.get("method") ?? ""),
      p_reference: String(form.get("reference") ?? ""), p_idempotency_key: id,
      p_bucket: "orbit-documents", p_path: path, p_file_name: file.name, p_mime_type: file.type,
    });
    if (error) throw error;
    path = "";
    refresh();
    return { ok: true, message: "Pago registrado una sola vez; liquidación complementaria pagada." };
  } catch (error) {
    if (path) await createAdminClient().storage.from("orbit-documents").remove([path]);
    return fail(error);
  }
}
