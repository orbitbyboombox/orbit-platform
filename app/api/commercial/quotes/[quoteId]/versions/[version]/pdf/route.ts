import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ quoteId: string; version: string }> },
) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return NextResponse.json({ message: "Sesión requerida." }, { status: 401 });
    const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS", "READONLY"].includes(profile.role))
      return NextResponse.json({ message: "Acceso denegado." }, { status: 403 });
    const { quoteId, version } = await context.params;
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) return NextResponse.json({ message: "Versión inválida." }, { status: 400 });
    const admin = createAdminClient();
    const { data: row, error } = await admin.from("quote_versions").select("pdf_storage_path").eq("quote_id", quoteId).eq("version_number", versionNumber).maybeSingle();
    if (error) throw error;
    if (!row?.pdf_storage_path) return NextResponse.json({ message: "PDF de esta versión no disponible." }, { status: 404 });
    const signed = await admin.storage.from("orbit-documents").createSignedUrl(row.pdf_storage_path, 60 * 60);
    if (signed.error) throw signed.error;
    return NextResponse.redirect(signed.data.signedUrl);
  } catch (error) {
    console.error("[commercial-quote-version-pdf]", error);
    return NextResponse.json({ message: "No fue posible abrir el PDF de la versión." }, { status: 500 });
  }
}
