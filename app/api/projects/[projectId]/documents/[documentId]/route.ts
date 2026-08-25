import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return NextResponse.json({ message: "Sesión requerida." }, { status: 401 });
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .single();
    if (!profile || !["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS", "READONLY"].includes(profile.role))
      return NextResponse.json({ message: "Acceso denegado." }, { status: 403 });
    const { projectId, documentId } = await context.params;
    const { data: document, error } = await client
      .from("documents")
      .select("id,project_id,storage_bucket,storage_path,original_filename,mime_type,document_type")
      .eq("id", documentId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .single();
    if (error || !document)
      return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });
    const downloaded = await client.storage
      .from(document.storage_bucket || "orbit-documents")
      .download(document.storage_path);
    if (downloaded.error)
      return NextResponse.json({ message: "Documento no disponible." }, { status: 404 });
    const filename = String(document.original_filename || `${document.document_type}.pdf`)
      .replace(/[\r\n"\\/]+/g, "-");
    const disposition = new URL(request.url).searchParams.get("download") === "1"
      ? "attachment"
      : "inline";
    return new NextResponse(new Uint8Array(await downloaded.data.arrayBuffer()), {
      headers: {
        "Content-Type": document.mime_type || downloaded.data.type || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="documento-orbit"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[ORBIT][PROTECTED_EVENT_DOCUMENT]", error);
    return NextResponse.json({ message: "No fue posible abrir el documento." }, { status: 500 });
  }
}
