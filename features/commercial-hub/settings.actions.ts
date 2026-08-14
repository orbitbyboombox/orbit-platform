"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
async function access() {
  const client = await createSupabaseServerActionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error(
      "Solo Founder o Administración puede configurar documentos.",
    );
  return { client, user: data.user };
}
export async function uploadCommercialDocumentAction(form: FormData) {
  try {
    const { client, user } = await access();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size)
      throw new Error("Selecciona un PDF.");
    if (file.type !== "application/pdf")
      throw new Error("El documento debe ser PDF.");
    if (file.size > 30 * 1024 * 1024) throw new Error("El PDF supera 30 MB.");
    const category = String(form.get("category")),
      name = String(form.get("name")).trim(),
      version = String(form.get("version")).trim();
    if (
      !["WEDDINGS", "COMPANIES", "EVENTS"].includes(category) ||
      !name ||
      !version
    )
      throw new Error("Completa nombre, categoría y versión.");
    const path = `commercial/${category.toLowerCase()}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const upload = await client.storage
      .from("orbit-documents")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await client
      .from("commercial_documents")
      .insert({
        name,
        category,
        version,
        filename: file.name,
        storage_path: path,
        status: "PENDING",
        uploaded_by: user.id,
      });
    if (error) throw error;
    revalidatePath("/settings");
    revalidatePath("/leads");
    return { ok: true as const, message: "Nueva versión cargada. Revísala y actívala cuando corresponda." };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible cargar el documento.",
    };
  }
}
export async function activateCommercialDocumentAction(id: string) {
  try {
    const { client } = await access();
    const { error } = await client.rpc("activate_commercial_document", { p_document_id: id });
    if (error) throw error;
    revalidatePath("/settings"); revalidatePath("/leads");
    return { ok: true as const, message: "Documento activado. La versión anterior permanece archivada." };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible activar el documento." }; }
}
export async function updateCommercialTemplateAction(form: FormData) {
  try {
    const { client, user } = await access();
    const id = String(form.get("id")),
      subject = String(form.get("subject")).trim(),
      body = String(form.get("body")).trim();
    if (!subject || !body)
      throw new Error("Asunto y mensaje son obligatorios.");
    const { error } = await client
      .from("commercial_email_templates")
      .update({
        subject,
        body,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/settings");
    revalidatePath("/leads");
    return { ok: true as const, message: "Plantilla guardada." };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible guardar la plantilla.",
    };
  }
}
export async function restoreCommercialTemplateAction(id: string) {
  try {
    const { client, user } = await access();
    const { data, error } = await client.from("commercial_email_templates").select("default_subject,default_body").eq("id", id).single();
    if (error) throw error;
    if (!data.default_subject || !data.default_body) throw new Error("La plantilla original no está disponible.");
    const { error: updateError } = await client.from("commercial_email_templates").update({ subject: data.default_subject, body: data.default_body, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) throw updateError;
    revalidatePath("/settings"); revalidatePath("/leads");
    return { ok: true as const, message: "Plantilla original restaurada." };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible restaurar la plantilla." }; }
}
export async function getCommercialDocumentUrlAction(id: string) {
  try {
    const { client } = await access();
    const { data, error } = await client
      .from("commercial_documents")
      .select("storage_path")
      .eq("id", id)
      .single();
    if (error) throw error;
    const signed = await client.storage
      .from("orbit-documents")
      .createSignedUrl(data.storage_path, 600);
    if (signed.error) throw signed.error;
    return { ok: true as const, url: signed.data.signedUrl };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible abrir el documento.",
    };
  }
}
