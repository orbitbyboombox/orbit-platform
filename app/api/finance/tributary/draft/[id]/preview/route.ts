import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));

const text = (value: unknown, fallback = "—") =>
  String(value ?? fallback).replace(/[^\x20-\x7EÀ-ÿ]/g, " ").trim() || fallback;

type Snapshot = {
  dteType?: string;
  customer?: { name?: string; company?: string; rut?: string; giro?: string; address?: string; city?: string; email?: string };
  event?: { name?: string; eventDate?: string; location?: string; city?: string; orbitEventId?: string };
  condition?: string;
  notes?: string;
  lines?: Array<{ description?: string; quantity?: number; unitPrice?: number; exempt?: boolean }>;
  totals?: { net?: number; exempt?: number; vat?: number; total?: number };
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await createSupabaseServerClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) return new NextResponse("Sesión requerida.", { status: 401 });
  const { data: profile } = await session.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return new NextResponse("Permiso administrativo requerido.", { status: 403 });

  const { id } = await params;
  const { data: draft, error } = await session.from("invoices").select("id,invoice_number,tributary_document_type,amount,status,project_id,tributary_snapshot,created_at").eq("id", id).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
  if (error || !draft) return new NextResponse("Borrador no encontrado.", { status: 404 });

  const { data: project } = draft.project_id
    ? await session.from("projects").select("id,name,event_date,location,city,orbit_event_id,customer_id").eq("id", draft.project_id).single()
    : { data: null };
  const { data: customer } = project?.customer_id
    ? await session.from("customers").select("full_name,company,rut,address,city,email,metadata").eq("id", project.customer_id).single()
    : { data: null };

  const snapshot = (draft.tributary_snapshot ?? {}) as Snapshot;
  const dteType = text(draft.tributary_document_type ?? snapshot.dteType, "33");
  const dteLabel: Record<string, string> = { "33": "FACTURA ELECTRÓNICA", "39": "BOLETA ELECTRÓNICA", "52": "GUÍA DE DESPACHO ELECTRÓNICA", "56": "NOTA DE DÉBITO ELECTRÓNICA", "61": "NOTA DE CRÉDITO ELECTRÓNICA" };
  const total = Number(snapshot.totals?.total ?? draft.amount ?? 0);
  const net = Number(snapshot.totals?.net ?? Math.round(total / 1.19));
  const vat = Number(snapshot.totals?.vat ?? Math.max(0, total - net));
  const exempt = Number(snapshot.totals?.exempt ?? 0);
  const lines = snapshot.lines?.length ? snapshot.lines : [{ description: project?.name ?? "Servicio BOOMBOX", quantity: 1, unitPrice: net, exempt: false }];

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.05, 0.06, 0.07);
  const orange = rgb(0.96, 0.45, 0.08);
  const red = rgb(0.72, 0.08, 0.08);
  const gray = rgb(0.38, 0.4, 0.43);
  const light = rgb(0.9, 0.9, 0.9);

  let boombox;
  try { boombox = await pdf.embedPng(await readFile(join(process.cwd(), "public/branding/boombox-official-logo.png"))); } catch { boombox = null; }
  if (boombox) page.drawImage(boombox, { x: 42, y: 745, width: 142, height: 38 });
  else page.drawText("BOOMBOX", { x: 42, y: 758, size: 22, font: bold, color: black });
  page.drawText("Experiencias que conectan", { x: 42, y: 728, size: 9, font: regular, color: gray });
  page.drawText("PRODUCCIONES BOOM BOX COMPANY SPA", { x: 42, y: 708, size: 9, font: bold, color: black });
  page.drawText("RUT 76.565.272-3 · www.bbox.cl · contacto@bbox.cl", { x: 42, y: 694, size: 8, font: regular, color: gray });
  page.drawText("Giro: Otras actividades de esparcimiento y recreativas N.C.P.", { x: 42, y: 681, size: 8, font: regular, color: gray });

  page.drawRectangle({ x: 388, y: 708, width: 165, height: 77, borderColor: red, borderWidth: 2, color: rgb(1, 1, 1) });
  page.drawText("R.U.T.: 76.565.272-3", { x: 402, y: 765, size: 9, font: bold, color: red });
  page.drawText(dteLabel[dteType] ?? "DOCUMENTO TRIBUTARIO", { x: 402, y: 748, size: 8, font: bold, color: red });
  page.drawText("N° " + text(draft.invoice_number), { x: 402, y: 730, size: 10, font: bold, color: red });
  page.drawText("DOCUMENTO SIMULADO · SIN VALIDEZ TRIBUTARIA", { x: 42, y: 654, size: 8, font: bold, color: red });

  page.drawLine({ start: { x: 42, y: 636 }, end: { x: 553, y: 636 }, thickness: 0.8, color: light });
  page.drawText("RECEPTOR", { x: 42, y: 619, size: 8, font: bold, color: gray });
  page.drawText("Señor(es): " + text(snapshot.customer?.name ?? customer?.full_name ?? customer?.company), { x: 42, y: 603, size: 10, font, color: black });
  page.drawText("RUT: " + text(snapshot.customer?.rut ?? customer?.rut, "Dato pendiente"), { x: 42, y: 588, size: 9, font, color: black });
  page.drawText("Giro: " + text(snapshot.customer?.giro, "Dato pendiente"), { x: 42, y: 574, size: 9, font, color: gray });
  page.drawText("Dirección: " + text(snapshot.customer?.address ?? customer?.address), { x: 300, y: 603, size: 9, font, color: black });
  page.drawText("Comuna: " + text(snapshot.customer?.city ?? customer?.city), { x: 300, y: 588, size: 9, font, color: black });
  page.drawText("Condición de pago: " + text(snapshot.condition, "Crédito"), { x: 300, y: 574, size: 9, font, color: gray });
  page.drawText("Evento: " + text(snapshot.event?.name ?? project?.name), { x: 42, y: 554, size: 9, font, color: black });
  page.drawText("Fecha emisión: " + new Date(String(draft.created_at)).toLocaleDateString("es-CL"), { x: 300, y: 554, size: 9, font, color: black });

  const tableTop = 520;
  page.drawRectangle({ x: 42, y: tableTop - 22, width: 511, height: 22, color: black });
  page.drawText("N°", { x: 50, y: tableTop - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("CANTIDAD", { x: 77, y: tableTop - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("DESCRIPCIÓN", { x: 145, y: tableTop - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("P. UNITARIO", { x: 410, y: tableTop - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("TOTAL", { x: 505, y: tableTop - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
  let y = tableTop - 42;
  lines.slice(0, 14).forEach((line, index) => {
    const quantity = Number(line.quantity ?? 1);
    const unit = Number(line.unitPrice ?? 0);
    page.drawText(String(index + 1), { x: 50, y, size: 8, font, color: black });
    page.drawText(String(quantity), { x: 77, y, size: 8, font, color: black });
    page.drawText(text(line.description, "Servicio BOOMBOX").slice(0, 42), { x: 145, y, size: 8, font, color: black });
    page.drawText(money(unit).replace("CLP", "").trim(), { x: 410, y, size: 8, font, color: black });
    page.drawText(money(quantity * unit).replace("CLP", "").trim(), { x: 505, y, size: 8, font, color: black });
    page.drawLine({ start: { x: 42, y: y - 6 }, end: { x: 553, y: y - 6 }, thickness: 0.35, color: light });
    y -= 22;
  });

  const totalY = Math.max(180, y - 12);
  page.drawText("Powered by", { x: 42, y: 125, size: 8, font: regular, color: gray });
  page.drawText("BOOMBOX®   ORBIT   PIXMEDIA", { x: 42, y: 108, size: 9, font: bold, color: black });
  page.drawText("TIMBRE ELECTRÓNICO", { x: 42, y: 82, size: 8, font: bold, color: gray });
  page.drawText("Omitido durante pruebas PRE-SII", { x: 42, y: 68, size: 8, font: regular, color: gray });
  page.drawText("Neto", { x: 375, y: totalY + 50, size: 9, font, color: gray });
  page.drawText(money(net), { x: 472, y: totalY + 50, size: 9, font, color: black });
  page.drawText("Exento", { x: 375, y: totalY + 34, size: 9, font, color: gray });
  page.drawText(money(exempt), { x: 472, y: totalY + 34, size: 9, font, color: black });
  page.drawText("IVA (19%)", { x: 375, y: totalY + 18, size: 9, font, color: gray });
  page.drawText(money(vat), { x: 472, y: totalY + 18, size: 9, font, color: black });
  page.drawText("TOTAL", { x: 375, y: totalY - 2, size: 11, font: bold, color: black });
  page.drawText(money(total), { x: 472, y: totalY - 2, size: 12, font: bold, color: orange });
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 24, color: black });
  page.drawRectangle({ x: 0, y: 24, width: 595.28, height: 4, color: orange });

  const bytes = await pdf.save();
  return new NextResponse(bytes as BodyInit, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="BOOMBOX-PRE-SII-${dteType}-${text(draft.invoice_number)}.pdf"`, "Cache-Control": "no-store" } });
}
