"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRcv, readSiiRcvFilename } from "./sii-rcv";

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
    const file = readSiiRcvFilename(source.name);
    const bytes = await source.arrayBuffer();
    const register = parseSiiRcv(bytes);
    if (register.kind !== file.kind) throw new Error("El nombre y el registro del archivo no coinciden.");
    if (register.documents.some(doc => doc.duplicate || !doc.knownType)) throw new Error("El archivo contiene documentos repetidos o tipos por revisar.");
    const period = `${file.period}-01`;
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
    return { saved: true, period: file.period, message: result.repeated
      ? `Archivo ya registrado. Nuevos: 0. Existentes: ${documents.length}. No se duplicaron documentos.`
      : `Nuevos: ${result.added}. Existentes sin cambios: ${documents.length - result.added - result.differences}. Diferencias por revisar: ${result.differences}.` };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "No se pudo revisar el archivo." };
  }
}

export async function recordRcvPeriodEvent(form: FormData) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Acceso restringido.");
  const period = String(form.get("period") ?? "");
  const action = String(form.get("action") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(period) || !reason || reason.length > 500
    || !["CLOSED", "REOPENED", "OWNER_ZERO_FEES"].includes(action)) throw new Error("Selecciona un mes e indica un motivo válido.");
  const { error } = await createAdminClient().rpc("sii_rcv_record_period_event" as never, {
    p_company: company, p_period: `${period}-01`, p_action: action, p_reason: reason, p_actor: user.id,
  } as never);
  if (error) throw new Error("No se pudo registrar el cambio de estado.");
  revalidatePath("/finance/tributary/accounting");
  revalidatePath("/finance/tributary/accountant-delivery");
}

export async function storeReceivedFee(form: FormData) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { message: "Sesión requerida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { message: "Acceso restringido." };
  const value = (field: string) => String(form.get(field) ?? "").trim();
  const period = value("period"), issued = value("issued"), name = value("name");
  const rut = value("rut").replace(/[.\-\s]/g, "").toUpperCase();
  const folio = value("folio").replace(/^0+(?=\d)/, "");
  const gross = value("gross"), withheld = value("withheld");
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period)
    || !/^\d{4}-\d{2}-\d{2}$/.test(issued) || !Number.isFinite(Date.parse(issued))
    || new Date(issued).toISOString().slice(0, 10) !== issued
    || !name || name.length > 150 || !/^[0-9]{7,8}[0-9K]$/.test(rut) || !/^[1-9]\d{0,17}$/.test(folio)
    || !/^[1-9]\d{0,11}$/.test(gross) || !/^\d{1,12}$/.test(withheld) || Number(withheld) > Number(gross)) {
    return { message: "Revisa el período, RUT, folio e importes." };
  }
  const sum = [...rut.slice(0, -1)].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + index % 6), 0);
  const verifier = (11 - sum % 11) % 11;
  if (rut.at(-1) !== (verifier === 10 ? "K" : String(verifier))) return { message: "El dígito verificador del RUT no coincide." };
  const file = form.get("pdf");
  let pdf: string | null = null;
  if (file instanceof File && file.size) {
    if (file.size > 750_000 || file.type !== "application/pdf") return { message: "Adjunta un PDF de hasta 750 KB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") return { message: "El respaldo no es un PDF válido." };
    pdf = "\\x" + bytes.toString("hex");
  }
  const { error } = await createAdminClient().from("sii_received_fees" as never).insert({
    company_rut: company, issuer_rut: rut, issuer_name: name, folio, issued_on: issued, period: `${period}-01`,
    gross: Number(gross), withheld: Number(withheld), document_pdf: pdf, created_by: user.id,
  } as never);
  if (error?.code === "23505") return { message: "Ya existe una boleta de ese emisor y folio." };
  if (error) return { message: "No se pudo guardar la boleta. Revisa si el período está abierto." };
  revalidatePath("/finance/tributary/accounting");
  return { message: "Boleta guardada para revisión. No se generó ningún movimiento financiero." };
}

export async function assignRcvPurchaseCategory(form: FormData) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { message: "Sesión requerida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { message: "Acceso restringido." };
  const period = String(form.get("period") ?? "");
  const key = String(form.get("key") ?? "");
  const category = String(form.get("category") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period) || !/^Compras\|[0-9K]+\|\d+\|\d+$/.test(key) || key.length > 80
    || !["FUEL","SUPPLIES","MAINTENANCE","TRANSPORT","SERVICES","PAYROLL","ADMINISTRATION","OTHER"].includes(category)
    || !reason || reason.length > 500) return { message: "Selecciona una categoría e indica el motivo." };
  const { error } = await createAdminClient().rpc("sii_rcv_assign_purchase_category" as never, {
    p_company: company, p_key: key, p_period: `${period}-01`, p_category: category, p_reason: reason, p_actor: user.id,
  } as never);
  if (error) return { message: "No se pudo guardar la categoría. Verifica que el documento pertenezca al período y que esté abierto." };
  revalidatePath("/finance/tributary/accounting");
  return { message: "Categoría guardada en el libro de compras." };
}
