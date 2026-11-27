import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siiCompanyRut } from "@/features/finance/sii-rcv-report";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return new NextResponse(null, { status: 403 });
  const { id } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const { data, error } = await createAdminClient().from("sii_received_fees" as never).select("document_pdf")
    .eq("id", id).eq("company_rut", siiCompanyRut).maybeSingle();
  if (error) return new NextResponse(null, { status: 500 });
  const pdf = (data as { document_pdf?: string } | null)?.document_pdf;
  if (!pdf?.startsWith("\\x")) return new NextResponse(null, { status: 404 });
  return new NextResponse(Uint8Array.from(Buffer.from(pdf.slice(2), "hex")), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": (new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment") + '; filename="boleta-honorarios.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
