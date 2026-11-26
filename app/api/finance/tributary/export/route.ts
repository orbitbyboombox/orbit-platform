import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new NextResponse("Sesión requerida", { status: 401 });
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return new NextResponse("No autorizado", { status: 403 });
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year"); const month = searchParams.get("month");
  let query = client.from("tributary_internal_ledger").select("source_type,document_type,reference,occurred_on,net_amount,exempt_amount,vat_amount,total_amount,payment_status,record_origin").order("occurred_on", { ascending: true });
  if (year) query = query.gte("occurred_on", `${year}-01-01`).lt("occurred_on", `${Number(year)+1}-01-01`);
  if (month && year) query = query.gte("occurred_on", `${year}-${String(month).padStart(2,"0")}-01`).lt("occurred_on", `${year}-${String(Number(month)+1).padStart(2,"0")}-01`);
  const { data, error } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });
  const headers = ["tipo","documento","referencia","fecha","neto","exento","iva","total","estado_pago","origen"];
  const esc=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv = "\uFEFF" + [headers, ...(data??[]).map(row=>[row.source_type,row.document_type,row.reference,row.occurred_on,row.net_amount,row.exempt_amount,row.vat_amount,row.total_amount,row.payment_status,row.record_origin])].map(row=>row.map(esc).join(";")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":`attachment; filename="orbit-libro-tributario.csv"` } });
}
