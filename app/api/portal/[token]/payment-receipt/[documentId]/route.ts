import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; documentId: string }> }) {
  const { token, documentId } = await params; const portal = await loadCustomerPortal(token);
  if (!portal) return NextResponse.json({ message: "Este enlace ya no está disponible." }, { status: 404 });
  const document = portal.documents.find((item) => item.id === documentId && item.document_type === "PAYMENT_RECEIPT");
  if (!document?.storage_path || document.storage_bucket !== "orbit-documents") return NextResponse.json({ message: "El comprobante no está disponible." }, { status: 404 });
  const admin = createAdminClient(); const { data, error } = await admin.storage.from("orbit-documents").download(document.storage_path);
  if (error || !data) return NextResponse.json({ message: "No fue posible abrir el comprobante." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(data, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Comprobante-BOOMBOX"`, "Content-Type": data.type || "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
}
