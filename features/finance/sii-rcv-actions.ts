"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRcv } from "./sii-rcv";

const company = "765652723";

export async function storeRcvForReview(form: FormData) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { message: "Sesión requerida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { message: "Acceso restringido." };
  const source = form.get("file");
  if (form.get("confirmed") !== "yes" || !(source instanceof File) || !source.size || source.size > 1_000_000) {
    return { message: "Confirma la importación y selecciona un archivo de hasta 1 MB." };
  }
  try {
    const file = /^(RCV_COMPRA_REGISTRO|RCV_VENTA)_([0-9.-]+)_([1-9]\d{3}(?:0[1-9]|1[0-2]))\.csv$/i.exec(source.name);
    if (!file || file[2].replace(/[^0-9]/g, "") !== company) throw new Error("El nombre del archivo no identifica a BOOMBOX y su período.");
    const bytes = await source.arrayBuffer();
    const register = parseSiiRcv(bytes);
    if (register.kind !== (file[1].toUpperCase() === "RCV_VENTA" ? "Ventas" : "Compras")) throw new Error("El nombre y el registro del archivo no coinciden.");
    if (register.documents.some(doc => doc.duplicate || !doc.knownType)) throw new Error("El archivo contiene documentos repetidos o tipos por revisar.");
    const period = `${file[3].slice(0,4)}-${file[3].slice(4)}-01`;
    const documents = register.documents.map(doc => ({
      ...doc,
      folio: doc.folio.replace(/^0+(?=\d)/, ""),
      issuer: register.kind === "Ventas" ? company : doc.rut.replace(/[^0-9k]/gi, "").toUpperCase(),
    }));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("store_sii_rcv_review" as never, {
      p_company: company, p_register: register.kind, p_period: period, p_name: source.name,
      p_source: Buffer.from(bytes).toString("base64"), p_actor: user.id, p_documents: documents,
    } as never);
    if (error || !data) return { message: "No se pudo guardar la revisión contable." };
    const result = data as { repeated: boolean; added: number; differences: number };
    revalidatePath("/finance/tributary/accounting");
    return { message: result.repeated ? "Este archivo ya se guardó. No se duplicaron documentos."
      : `Documentos nuevos: ${result.added}. Diferencias pendientes de revisión: ${result.differences}.` };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "No se pudo revisar el archivo." };
  }
}
