"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

async function assertStaffFinanceAdmin() {
  const client = await createSupabaseServerActionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Sesión administrativa requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Acceso administrativo requerido.");
  return user.id;
}

const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const resultError = (e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : "No fue posible completar BOLETA SOS." });

export async function createBoletaSosAction(form: FormData) {
  try {
    await assertStaffFinanceAdmin();
    const settlementId = String(form.get("settlementId") ?? "");
    if (!uuid(settlementId)) throw new Error("Selecciona un evento válido.");
    const admin = createAdminClient();
    const { error } = await admin.rpc("create_staff_complementary_settlement", {
      p_settlement_id: settlementId,
      p_reason: "BOLETA SOS — boleta adicional excepcional solicitada por administración",
    });
    if (error) throw new Error(error.message);
    revalidatePath("/resources/staff");
    return { ok: true, message: "BOLETA SOS creada. Ahora puedes adjuntar la boleta." };
  } catch (e) { return resultError(e); }
}

export async function uploadBoletaSosAction(form: FormData) {
  let path = "";
  try {
    await assertStaffFinanceAdmin();
    const settlementId = String(form.get("settlementId") ?? "");
    const issueDate = String(form.get("issueDate") ?? "");
    const file = form.get("file");
    if (!uuid(settlementId)) throw new Error("Selecciona un evento válido.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new Error("Indica la fecha de la boleta.");
    if (!(file instanceof File) || file.size < 1 || file.size > 15 * 1024 * 1024 || !allowed.has(file.type))
      throw new Error("Adjunta un PDF o imagen válida de máximo 15 MB.");
    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin.from("staff_complementary_settlements").select("id,status,boleta_document_id,paid_amount").eq("settlement_id", settlementId).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing?.boleta_document_id) throw new Error("Este evento ya tiene una boleta SOS registrada.");
    if (existing && !["PENDING", "BOLETA_REJECTED"].includes(existing.status)) throw new Error("Esta liquidación no admite una nueva boleta.");
    if (Number(existing?.paid_amount ?? 0) > 0) throw new Error("Este evento ya tiene pagos registrados.");
    if (!existing) {
      const { error: creationError } = await admin.rpc("create_staff_complementary_settlement", {
        p_settlement_id: settlementId,
        p_reason: "BOLETA SOS — carga excepcional administrativa",
      });
      if (creationError) throw new Error(creationError.message);
    }
    const { data: complementary, error: complementaryError } = await admin.from("staff_complementary_settlements").select("id,status,boleta_document_id,paid_amount").eq("settlement_id", settlementId).single();
    if (complementaryError || !complementary) throw new Error("No se encontró la liquidación complementaria.");
    if (!["PENDING", "BOLETA_REJECTED"].includes(complementary.status) || complementary.boleta_document_id || Number(complementary.paid_amount ?? 0) > 0) throw new Error("La liquidación complementaria no admite una nueva boleta.");
    path = `staff/boleta-sos/${settlementId}/${randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const upload = await admin.storage.from("orbit-documents").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) throw new Error(upload.error.message);
    const authenticated = await createSupabaseServerActionClient();
    const { error } = await authenticated.rpc("submit_staff_complementary_boleta", {
      p_settlement_id: complementary.id,
      p_bucket: "orbit-documents",
      p_path: path,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_issue_date: issueDate,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/resources/staff");
    return { ok: true, message: "Boleta SOS subida. Pendiente de revisión; NO se ha registrado ningún pago." };
  } catch (e) {
    if (path) await createAdminClient().storage.from("orbit-documents").remove([path]);
    return resultError(e);
  }
}

export async function listBoletaSosCandidatesAction(staffId: string, month: string) {
  try {
    await assertStaffFinanceAdmin();
    if (!uuid(staffId) || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Operador o mes inválido.");
    const admin = await createSupabaseServerActionClient();
    const { data, error } = await admin.from("staff_complementary_settlements")
      .select("settlement_id,event_date,net_amount,status,boleta_document_id,paid_amount")
      .eq("staff_id", staffId).eq("original_month", month + "-01");
    if (error) throw new Error(error.message);
    return { ok: true, candidates: (data ?? []).filter(row => !row.boleta_document_id && Number(row.paid_amount ?? 0) === 0 && row.status === "PENDING").map(row => ({
      settlementId: String(row.settlement_id), eventDate: String(row.event_date), workNet: Number(row.net_amount)
    })), message: "" };
  } catch (e) {
    return { ok: false, candidates: [], message: e instanceof Error ? e.message : "No fue posible consultar BOLETA SOS." };
  }
}

export async function listBoletaSosReviewAction(staffId: string, month: string) {
  try {
    await assertStaffFinanceAdmin();
    if (!uuid(staffId) || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Operador o mes inválido.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("staff_complementary_settlements")
      .select("id,event_date,net_amount,status,boleta_document_id,paid_amount")
      .eq("staff_id", staffId).eq("original_month", month + "-01").eq("status", "BOLETA_RECEIVED");
    if (error) throw new Error(error.message);
    const documentIds = (data ?? []).map(row => row.boleta_document_id).filter((id): id is string => typeof id === "string");
    const { data: documents, error: documentError } = documentIds.length
      ? await admin.from("staff_onboarding_documents").select("id,storage_bucket,storage_path,file_name").in("id", documentIds)
      : { data: [], error: null };
    if (documentError) throw new Error(documentError.message);
    const byId = new Map((documents ?? []).map(doc => [doc.id, doc]));
    const items = (data ?? []).flatMap(row => {
      const doc = byId.get(row.boleta_document_id);
      if (!doc || doc.storage_bucket !== "orbit-documents" || !doc.storage_path) return [];
      return [{ id: row.id, eventDate: row.event_date, amount: Number(row.net_amount), fileName: doc.file_name ?? "Boleta", paidAmount: Number(row.paid_amount ?? 0) }];
    });
    return { ok: true, items, message: "" };
  } catch (e) { return { ok: false, items: [], message: e instanceof Error ? e.message : "No se pudo consultar la revisión." }; }
}

export async function viewBoletaSosAction(complementaryId: string) {
  try {
    await assertStaffFinanceAdmin();
    if (!uuid(complementaryId)) throw new Error("Liquidación inválida.");
    const admin = createAdminClient();
    const { data: item, error } = await admin.from("staff_complementary_settlements").select("boleta_document_id,status").eq("id", complementaryId).single();
    if (error || !item?.boleta_document_id || item.status !== "BOLETA_RECEIVED") throw new Error("Boleta no disponible.");
    const { data: doc, error: docError } = await admin.from("staff_onboarding_documents").select("storage_bucket,storage_path").eq("id", item.boleta_document_id).single();
    if (docError || !doc || doc.storage_bucket !== "orbit-documents") throw new Error("Documento no disponible.");
    const { data: signed, error: signError } = await admin.storage.from("orbit-documents").createSignedUrl(doc.storage_path, 120);
    if (signError || !signed?.signedUrl) throw new Error("No se pudo abrir la boleta.");
    return { ok: true, url: signed.signedUrl, message: "" };
  } catch (e) { return { ok: false, url: "", message: e instanceof Error ? e.message : "No se pudo abrir la boleta." }; }
}

export async function approveBoletaSosAction(complementaryId: string) {
  try {
    await assertStaffFinanceAdmin();
    if (!uuid(complementaryId)) throw new Error("Liquidación inválida.");
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("review_staff_complementary_boleta", {
      p_settlement_id: complementaryId, p_action: "APPROVE", p_reason: null
    });
    if (error) throw new Error(error.message);
    revalidatePath("/resources/staff");
    return { ok: true, message: "Boleta aprobada. Pendiente de pago; no se registró ningún pago." };
  } catch (e) { return resultError(e); }
}
