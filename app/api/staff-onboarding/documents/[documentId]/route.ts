import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ message: "Sesión requerida." }, { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    return NextResponse.json({ message: "Acceso denegado." }, { status: 403 });
  const { documentId } = await params;
  const admin = createAdminClient();
  const { data: document } = await admin
    .from("staff_onboarding_documents")
    .select("storage_bucket,storage_path,file_name,mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (!document)
    return NextResponse.json(
      { message: "Documento no encontrado." },
      { status: 404 },
    );
  const { data, error } = await admin.storage
    .from(document.storage_bucket)
    .download(document.storage_path);
  if (error)
    return NextResponse.json(
      { message: "Documento no disponible." },
      { status: 404 },
    );
  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${document.file_name.replaceAll('"', "")}"`,
      "Content-Type": document.mime_type,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
