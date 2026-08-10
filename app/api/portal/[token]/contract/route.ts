import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await loadCustomerPortal(token);
  if (!portal?.agreement?.signed_pdf_path || portal.agreement.status !== "SIGNED") return NextResponse.json({ message: "El contrato firmado aún no está disponible." }, { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("orbit-documents").download(portal.agreement.signed_pdf_path);
  if (error || !data) return NextResponse.json({ message: "No fue posible abrir el contrato." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(data, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Contrato-BOOMBOX.pdf"`, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff" } });
}
