import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function asciiFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\\r\n]/g, "-")
    .trim();
  return normalized || "comprobante";
}

function encodedFileName(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params;
  const admin = createAdminClient();
  const portal = await loadPortalSession("STAFF");
  let adminAllowed = false;

  if (!portal?.staff_id) {
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (data.user) {
      const { data: profile } = await client
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      adminAllowed = Boolean(
        profile && ["CEO", "ADMINISTRATOR"].includes(profile.role),
      );
    }
  }

  const { data: account } = await admin
    .from("staff_monthly_accounts")
    .select("staff_id,payment_receipt_document_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account || (!adminAllowed && portal?.staff_id !== account.staff_id)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  }

  const { data: doc } = await admin
    .from("staff_onboarding_documents")
    .select("storage_bucket,storage_path,file_name,mime_type")
    .eq("id", account.payment_receipt_document_id)
    .eq("staff_id", account.staff_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!doc) {
    return NextResponse.json(
      { message: "Comprobante no encontrado." },
      { status: 404 },
    );
  }

  const { data, error } = await admin.storage
    .from(doc.storage_bucket)
    .download(doc.storage_path);

  if (error || !data) {
    return NextResponse.json(
      { message: "Archivo no disponible." },
      { status: 404 },
    );
  }

  const fallback = asciiFileName(doc.file_name);
  const encoded = encodedFileName(doc.file_name);

  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
