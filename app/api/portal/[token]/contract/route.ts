import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";
import { contractPdfFilename, resolveContractPdfPath } from "@/features/customer-portal/contract-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await loadCustomerPortal(token);
  if (!portal?.agreement || !["SIGNED", "COMMERCIAL_DOCUMENT"].includes(portal.agreement.status)) return NextResponse.json({ message: "El documento oficial aún no está disponible." }, { status: 404 });
  const admin = createAdminClient();
  const { data: pdfDocuments, error: documentError } = await admin.from("documents").select("storage_path,mime_type,original_filename,created_at").eq("project_id", portal.project.id).eq("document_type", "SIGNED_AGREEMENT").is("deleted_at", null).order("created_at", { ascending: false });
  if (documentError) return NextResponse.json({ message: "No fue posible localizar el contrato PDF." }, { status: 500 });
  const pdfPath = resolveContractPdfPath(portal.agreement.signed_pdf_path, pdfDocuments ?? []);
  if (!pdfPath) return NextResponse.json({ message: "Tu contrato todavía se está preparando. Intenta nuevamente en unos segundos." }, { status: 404 });
  const { data, error } = await admin.storage.from("orbit-documents").download(pdfPath);
  if (error || !data) return NextResponse.json({ message: "No fue posible abrir el contrato." }, { status: 404 });
  const bytes = new Uint8Array(await data.arrayBuffer());
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (magic !== "%PDF-") return NextResponse.json({ message: "Tu contrato PDF todavía se está preparando. Intenta nuevamente en unos segundos." }, { status: 409 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = contractPdfFilename(portal.project.name, portal.project.orbit_event_id);
  return new NextResponse(bytes, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff" } });
}
