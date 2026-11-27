import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { loadMonthlyAccountingStaff, readMonthlyAccountingAttachments } from "@/features/finance/monthly-accounting-staff";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new NextResponse("Sesión requerida", { status: 401 });
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return new NextResponse("No autorizado", { status: 403 });
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year"); const month = searchParams.get("month"); const format = searchParams.get("format") ?? "csv";
  const simulation = searchParams.get("scope") === "simulation";
  if ((year !== null && !/^[1-9]\d{3}$/.test(year))
    || (month !== null && (year === null || !/^(?:0?[1-9]|1[0-2])$/.test(month)))) {
    return new NextResponse("Período inválido. Indica un año y, opcionalmente, un mes del 1 al 12.", { status: 400 });
  }
  if (format === "zip" && (simulation || !year || !month)) {
    return new NextResponse("El paquete del contador requiere año y mes del registro interno.", { status: 400 });
  }
  const baseFields = "source_type,document_type,reference,occurred_on,net_amount,exempt_amount,vat_amount,total_amount,payment_status,record_origin";
  const countOptions = { count: "exact" } as const;
  const selected = format === "zip"
    ? client.from("tributary_internal_ledger").select(`source_id,${baseFields}`, countOptions)
    : client.from(simulation ? "tributary_simulation_export" : "tributary_internal_ledger").select(baseFields, countOptions);
  let query = selected.order("occurred_on", { ascending: true });
  if (!simulation) query = query.in("record_origin", ["EXTERNAL_SII", "EXPENSE"]);
  if (year !== null) {
    const firstMonth = month === null ? 1 : Number(month);
    const nextYear = month === null || firstMonth === 12 ? Number(year) + 1 : Number(year);
    const nextMonth = nextYear === Number(year) ? firstMonth + 1 : 1;
    const start = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
    const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    query = query.gte("occurred_on", start).lt("occurred_on", end);
  }
  const { data, error, count } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });
  const headers = ["tipo","documento","referencia","fecha","neto","exento","iva","total","estado_pago","origen"];
  const rows = data ?? [];
  if (count !== null && count > rows.length) return new NextResponse("El resultado excede el límite de exportación. Usa un período menor.", { status: 422 });
  type Row = (typeof rows)[number];
  const values = (r: Row) => [r.source_type,r.document_type,r.reference,r.occurred_on,r.net_amount,r.exempt_amount,r.vat_amount,r.total_amount,r.payment_status,r.record_origin];
  const esc = (v: unknown) => {
    const raw = String(v ?? "");
    const safe = typeof v === "string" && /^[\s]*[=+@-]/.test(raw) && !/^-?\d+(?:\.\d+)?$/.test(raw) ? "'" + raw : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const toCsv = (selected: Row[]) => "\uFEFF" + [headers, ...selected.map(values)].map(row => row.map(esc).join(";")).join("\n");
  const csv = toCsv(rows);
  if (format === "zip") {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const purchases = rows.filter(r => r.record_origin === "EXPENSE");
    const sales = rows.filter(r => r.record_origin === "EXTERNAL_SII");
    const pending = rows.filter(r => !r.document_type || !r.reference || r.net_amount == null || r.vat_amount == null || r.total_amount == null
      || Number(r.net_amount) + Number(r.exempt_amount ?? 0) + Number(r.vat_amount) !== Number(r.total_amount));
    const zip = new JSZip();
    const workbook = new ExcelJS.Workbook();
    for (const [label, selected] of [["Compras", purchases], ["Ventas", sales], ["Por revisar", pending]] as const) {
      zip.file(`${label.toLowerCase().replaceAll(" ", "-")}.csv`, toCsv(selected));
      const sheet = workbook.addWorksheet(label);
      sheet.addRow(headers);
      for (const row of selected) sheet.addRow(values(row));
    }
    try {
      const staff = await loadMonthlyAccountingStaff(period);
      const sourceIds = (selected: Row[]) => selected.flatMap(row => "source_id" in row && typeof row.source_id === "string" ? [row.source_id] : []);
      const backups = await readMonthlyAccountingAttachments(staff.attachments, sourceIds(purchases), sourceIds(sales));
      const extra = [...staff.sheets, { title: "Respaldos", headers: ["grupo", "identificador", "estado", "archivo"], rows: backups.manifest }];
      for (const { title, headers, rows } of extra) {
        const sheet = workbook.addWorksheet(title);
        sheet.addRow(headers);
        for (const row of rows) sheet.addRow(row);
        zip.file(`${title.toLowerCase().replaceAll(" ", "-")}.csv`, "\uFEFF" + [headers, ...rows].map(row => row.map(esc).join(";")).join("\n"));
      }
      for (const { path, bytes } of backups.files) zip.file(path, bytes);
    } catch {
      return new NextResponse("No se pudo completar el paquete de respaldos del período. Reintenta antes de enviarlo al contador.", { status: 503 });
    }
    zip.file("registro-interno.xlsx", new Uint8Array(await workbook.xlsx.writeBuffer()));
    zip.file("LEEME.txt", [
      `ORBIT · Registro interno del período ${period}`,
      `Compras: ${purchases.length} · Ventas documentadas: ${sales.length} · Filas por revisar: ${pending.length}`,
      "La columna IVA contiene el monto registrado por documento. No determina derecho a crédito fiscal ni saldo oficial SII.",
      "Staff: liquidaciones y pagos por período tributario, en hojas separadas. No sumar ambas fuentes como un solo pago.",
      "Consulta Respaldos para identificar incluidos, faltantes y omitidos. El ZIP incluye solamente documentos ya asociados y permitidos.",
      "No incluye simulaciones ni genera XML oficiales. La conciliación con el SII queda pendiente.",
    ].join("\n"));
    const output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    if (output.length > 4_000_000) return new NextResponse("El paquete supera el límite de descarga. Los registros CSV siguen disponibles por período.", { status: 413 });
    return new NextResponse(output as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="orbit-contador-${period}.zip"`, "Cache-Control": "no-store" } });
  }
  if (format === "xls") {
    const body = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${(data ?? []).map((row) => {
      const values = [row.source_type,row.document_type,row.reference,row.occurred_on,row.net_amount,row.exempt_amount,row.vat_amount,row.total_amount,row.payment_status,row.record_origin];
      return `<tr>${values.map((v) => `<td>${String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>`).join("")}</tr>`;
    }).join("")}</tbody></table></body></html>`;
    return new NextResponse(body, { headers: { "Content-Type":"application/vnd.ms-excel; charset=utf-8", "Content-Disposition":`attachment; filename="orbit-libro-tributario.xls"` } });
  }
  return new NextResponse(csv, { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":`attachment; filename="orbit-libro-tributario.csv"` } });
}
