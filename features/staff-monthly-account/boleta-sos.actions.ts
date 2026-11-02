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
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(issueDate)) throw new Error("Indica la fecha de la boleta.");
    if (!(file instanceof File) || file.size < 1 || file.size > 15 * 1024 * 1024 || !allowed.has(file.type))
      throw new Error("Adjunta un PDF o imagen válida de máximo 15 MB.");
    const admin = createAdminClient();
    path = `staff/boleta-sos/${settlementId}/${randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const upload = await admin.storage.from("orbit-documents").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) throw new Error(upload.error.message);
    const { error } = await admin.rpc("submit_staff_complementary_boleta", {
      p_settlement_id: settlementId,
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
