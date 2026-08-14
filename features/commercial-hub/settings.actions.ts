"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommercialCatalogCategory, validateCommercialUpload } from "./catalogs";
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
export async function prepareCommercialDocumentUploadAction(input: {
  category: string;
  name: string;
  version: string;
  filename: string;
  mimeType: string;
  size: number;
}) {
  try {
    await access();
    const category = input.category;
    const name = input.name.trim();
    const version = input.version.trim();
    const validation = validateCommercialUpload({ mimeType: input.mimeType, size: input.size });
    if (validation) throw new Error(validation);
    if (!isCommercialCatalogCategory(category) || !name || !version)
      throw new Error("Completa nombre, categoría y versión.");
    const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-") || "catalogo.pdf";
    const path = `commercial/${category.toLowerCase()}/${crypto.randomUUID()}-${filename}`;
    const admin = createAdminClient();
    const signed = await admin.storage.from("orbit-documents").createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    return { ok: true as const, path, token: signed.data.token, signedUrl: signed.data.signedUrl };
  } catch (error) {
    console.error("Commercial document upload preparation failed", error);
    return { ok: false as const, error: error instanceof Error ? error.message : "No pudimos preparar la carga del catálogo." };
  }
}

export async function finalizeCommercialDocumentUploadAction(input: {
  category: string;
  name: string;
  version: string;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
}) {
  try {
    const { client, user } = await access();
    const validation = validateCommercialUpload({ mimeType: input.mimeType, size: input.size });
    if (validation) throw new Error(validation);
    if (!isCommercialCatalogCategory(input.category) || !input.name.trim() || !input.version.trim())
      throw new Error("Completa nombre, categoría y versión.");
    if (!input.path.startsWith(`commercial/${input.category.toLowerCase()}/`))
      throw new Error("La referencia del archivo no es válida.");
    const admin = createAdminClient();
    const info = await admin.storage.from("orbit-documents").info(input.path);
    if (info.error) throw new Error("Storage no confirmó el archivo cargado.");
    const { error } = await client
      .from("commercial_documents")
      .insert({
        name: input.name.trim(),
        category: input.category,
        version: input.version.trim(),
        filename: input.filename,
        storage_path: input.path,
        file_size: input.size,
        metadata: { mimeType: input.mimeType, uploadMode: "SIGNED_DIRECT" },
        status: "PENDING",
        uploaded_by: user.id,
      });
    if (error) throw error;
    revalidatePath("/settings");
    revalidatePath("/leads");
    return { ok: true as const, message: "Catálogo cargado correctamente. Revísalo y actívalo cuando corresponda." };
  } catch (error) {
    console.error("Commercial document upload finalization failed", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "No pudimos cargar el catálogo. Intenta nuevamente.",
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
