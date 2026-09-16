import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const safeFilename = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 140) || "documento";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const started = Date.now();
  const { documentId } = await params;
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [{ data: profile, error: profileError }, { data: document, error: documentError }] = await Promise.all([
      client.from("profiles").select("role").eq("id", auth.user.id).single(),
      client.from("office_lease_documents").select("storage_bucket,storage_path,original_filename,mime_type").eq("id", documentId).is("deleted_at", null).single(),
    ]);
    if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (documentError || !document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const downloaded = await createAdminClient().storage.from(document.storage_bucket).download(document.storage_path);
    if (downloaded.error) throw downloaded.error;
    const disposition = new URL(request.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
    console.info(JSON.stringify({ level: "info", event: "office_rent_document_download", documentId, ms: Date.now() - started }));
    return new NextResponse(new Uint8Array(await downloaded.data.arrayBuffer()), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${disposition}; filename="${safeFilename(document.original_filename)}"`,
        "Content-Type": document.mime_type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "office_rent_document_download_failed", documentId, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
    return NextResponse.json({ error: "No fue posible abrir el documento." }, { status: 500 });
  }
}
