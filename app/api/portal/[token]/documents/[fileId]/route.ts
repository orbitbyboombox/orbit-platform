import { NextResponse } from "next/server";

import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  const portal = await loadCustomerPortal(token);
  if (!portal) return NextResponse.json({ message: "Este enlace ya no está disponible." }, { status: 404 });

  const file = portal.customerDocuments.files.find((item) => item.id === fileId);
  const admin = createAdminClient();
  const { data: stored } = await admin.from("documents").select("id,storage_bucket,storage_path,drive_file_id,original_filename,mime_type,is_current,deleted_at").eq("id", fileId).eq("project_id", portal.access.project_id).is("deleted_at", null).maybeSingle();
  if (!file && !stored) return NextResponse.json({ message: "El documento no pertenece a este evento." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (stored?.storage_bucket && stored.storage_path) {
    const { data, error } = await admin.storage.from(stored.storage_bucket).download(stored.storage_path);
    if (!error && data) {
      const safeName = String(stored.original_filename || "documento-boombox").replace(/[\r\n"\\/]/g, "-");
      return new NextResponse(data, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`, "Content-Type": stored.mime_type || data.type || "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
    }
  }

  if (!file && stored?.drive_file_id) {
    const accessToken = await loadGoogleWorkspaceAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stored.drive_file_id)}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok || !response.body) return NextResponse.json({ message: "No fue posible abrir el documento." }, { status: response.status === 404 ? 404 : 502 });
    const safeName = String(stored.original_filename || "documento-boombox").replace(/[\r\n"\\/]/g, "-");
    return new NextResponse(response.body, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`, "Content-Type": stored.mime_type || "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
  }
  if (!file) return NextResponse.json({ message: "El archivo del documento no está disponible." }, { status: 404 });

  const accessToken = await loadGoogleWorkspaceAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!response.ok || !response.body) {
    return NextResponse.json({ message: "No fue posible abrir el documento." }, { status: response.status === 404 ? 404 : 502 });
  }

  const safeName = file.name.replace(/[\r\n"\\/]/g, "-");
  return new NextResponse(response.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Content-Type": file.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
