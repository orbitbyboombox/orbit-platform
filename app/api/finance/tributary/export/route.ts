import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new NextResponse("Sesión requerida", { status: 401 });
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return new NextResponse("No autorizado", { status: 403 });
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year"); const month = searchParams.get("month"); const format = searchParams.get("format") ?? "csv";
  if ((year !== null && !/^[1-9]\d{3}$/.test(year))
    || (month !== null && (year === null || !/^(?:0?[1-9]|1[0-2])$/.test(month)))) {
    return new NextResponse("Período inválido. Indica un año y, opcionalmente, un mes del 1 al 12.", { status: 400 });
  }
  let query = client.from(searchParams.get("scope") === "simulation" ? "tributary_simulation_export" : "tributary_internal_ledger").select("source_type,document_type,reference,occurred_on,net_amount,exempt_amount,vat_amount,total_amount,payment_status,record_origin").order("occurred_on", { ascending: true });
  if (year !== null) {
    const firstMonth = month === null ? 1 : Number(month);
    const nextYear = month === null || firstMonth === 12 ? Number(year) + 1 : Number(year);
    const nextMonth = nextYear === Number(year) ? firstMonth + 1 : 1;
    const start = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
    const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    query = query.gte("occurred_on", start).lt("occurred_on", end);
  }
  const { data, error } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });
  const headers = ["tipo","documento","referencia","fecha","neto","exento","iva","total","estado_pago","origen"];
  const esc=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv = "\uFEFF" + [headers, ...(data??[]).map(row=>[row.source_type,row.document_type,row.reference,row.occurred_on,row.net_amount,row.exempt_amount,row.vat_amount,row.total_amount,row.payment_status,row.record_origin])].map(row=>row.map(esc).join(";")).join("\n");
  if (format === "xls") {
    const body = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${(data ?? []).map((row) => {
      const values = [row.source_type,row.document_type,row.reference,row.occurred_on,row.net_amount,row.exempt_amount,row.vat_amount,row.total_amount,row.payment_status,row.record_origin];
      return `<tr>${values.map((v) => `<td>${String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>`).join("")}</tr>`;
    }).join("")}</tbody></table></body></html>`;
    return new NextResponse(body, { headers: { "Content-Type":"application/vnd.ms-excel; charset=utf-8", "Content-Disposition":`attachment; filename="orbit-libro-tributario.xls"` } });
  }
  return new NextResponse(csv, { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":`attachment; filename="orbit-libro-tributario.csv"` } });
}
