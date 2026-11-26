import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));

const clean = (value: unknown, fallback = "—") =>
  String(value ?? fallback).replace(/[^\x20-\x7EÀ-ÿ]/g, " ").trim() || fallback;

type Snapshot = {
  dteType?: string;
  customer?: { name?: string; company?: string; rut?: string; giro?: string; address?: string; city?: string; email?: string; phone?: string };
  event?: { name?: string; eventDate?: string; location?: string; city?: string; orbitEventId?: string };
  condition?: string;
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
  const { data: draft, error } = await session.from("invoices").select("id,invoice_number,tributary_document_type,amount,project_id,tributary_snapshot,created_at").eq("id", id).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
  if (error || !draft) return new NextResponse("Borrador no encontrado.", { status: 404 });

  const { data: project } = draft.project_id
    ? await session.from("projects").select("id,name,event_date,location,city,orbit_event_id,customer_id").eq("id", draft.project_id).single()
    : { data: null };
  const { data: customer } = project?.customer_id
    ? await session.from("customers").select("full_name,company,rut,address,city,email,metadata").eq("id", project.customer_id).single()
    : { data: null };

  const snapshot = (draft.tributary_snapshot ?? {}) as Snapshot;
  const dteType = clean(draft.tributary_document_type ?? snapshot.dteType, "33");
  const labels: Record<string, string> = { "33": "FACTURA ELECTRÓNICA", "39": "BOLETA ELECTRÓNICA", "52": "GUÍA DE DESPACHO ELECTRÓNICA", "56": "NOTA DE DÉBITO ELECTRÓNICA", "61": "NOTA DE CRÉDITO ELECTRÓNICA" };
  const total = Number(snapshot.totals?.total ?? draft.amount ?? 0);
  const net = Number(snapshot.totals?.net ?? Math.round(total / 1.19));
  const vat = Number(snapshot.totals?.vat ?? Math.max(0, total - net));
  const exempt = Number(snapshot.totals?.exempt ?? 0);
  const lines = snapshot.lines?.length ? snapshot.lines : [{ description: project?.name ?? "Servicio BOOMBOX", quantity: 1, unitPrice: net, exempt: false }];

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.04, 0.04, 0.04);
  const red = rgb(0.72, 0.08, 0.10);
  const gray = rgb(0.25, 0.25, 0.25);
  const line = rgb(0.16, 0.16, 0.16);
  const white = rgb(1, 1, 1);

  const border = (x: number, y: number, width: number, height: number, thickness = 0.8) =>
    page.drawRectangle({ x, y, width, height, borderColor: line, borderWidth: thickness, color: white });
  const labelValue = (label: string, value: unknown, x: number, y: number, valueX: number, size = 8.4) => {
    page.drawText(label, { x, y, size, font: bold, color: black });
    page.drawText(": " + clean(value), { x: valueX, y, size, font: regular, color: black });
  };

  page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderColor: line, borderWidth: 0.9, color: white });

  // Logotipo negro clásico aprobado, con eslogan integrado en el arte original.
  let classicLogo;
  try { classicLogo = await pdf.embedPng(await readFile(join(process.cwd(), "public/branding/boombox-logo-classic-black.png"))); } catch { classicLogo = null; }
  if (classicLogo) page.drawImage(classicLogo, { x: 42, y: 735, width: 150, height: 58 });
  else {
    page.drawText("BOOMBOX®", { x: 42, y: 748, size: 29, font: bold, color: black });
    page.drawText("Experiencias que conectan", { x: 66, y: 730, size: 9, font: bold, color: black });
  }
  page.drawLine({ start: { x: 205, y: 728 }, end: { x: 205, y: 797 }, thickness: 1, color: line });
  page.drawText("PRODUCCIONES BOOM BOX", { x: 215, y: 785, size: 7.6, font: bold, color: black });
  page.drawText("COMPANY SPA", { x: 215, y: 774, size: 7.6, font: bold, color: black });
  page.drawText("RUT: 76.565.272-3", { x: 215, y: 762, size: 7.4, font: regular, color: black });
  page.drawText("Giro: Producción de eventos y publicidad", { x: 215, y: 750, size: 7.4, font: regular, color: black });
  page.drawText("Puerta Oriente 361, of. 310 C, Colina", { x: 215, y: 738, size: 7.4, font: regular, color: black });
  page.drawText("contacto@bbox.cl · www.bbox.cl", { x: 215, y: 726, size: 7.4, font: regular, color: black });

  page.drawRectangle({ x: 390, y: 735, width: 165, height: 63, borderColor: red, borderWidth: 1.8, color: white });
  const drawCenteredTaxLine = (value: string, y: number, preferredSize: number) => {
    const size = preferredSize * Math.min(1, 141 / bold.widthOfTextAtSize(value, preferredSize));
    const x = 390 + (165 - bold.widthOfTextAtSize(value, size)) / 2;
    page.drawText(value, { x, y, size, font: bold, color: red });
  };
  drawCenteredTaxLine("R.U.T.: 76.565.272-3", 781, 8.8);
  drawCenteredTaxLine(labels[dteType] ?? "DOCUMENTO TRIBUTARIO", 763, 8.2);
  drawCenteredTaxLine("N° " + clean(draft.invoice_number), 745, 10.5);
  page.drawText("S.I.I. - Santiago Norte", { x: 431, y: 721, size: 8.8, font: bold, color: red });

  border(35, 590, 525, 100, 0.9);
  labelValue("Señor(es)", snapshot.customer?.name ?? customer?.full_name ?? customer?.company, 48, 672, 103);
  labelValue("RUT", snapshot.customer?.rut ?? customer?.rut, 48, 658, 103);
  labelValue("Dirección", snapshot.customer?.address ?? customer?.address, 48, 644, 103);
  labelValue("Comuna", snapshot.customer?.city ?? customer?.city, 48, 630, 103);
  labelValue("Giro", snapshot.customer?.giro ?? customer?.metadata?.giro, 48, 616, 103);
  labelValue("Fono", snapshot.customer?.phone, 48, 602, 103);
  labelValue("Fecha emisión", new Date(String(draft.created_at)).toLocaleDateString("es-CL"), 365, 672, 454);
  labelValue("Condición de pago", snapshot.condition ?? "Prueba", 365, 658, 454);
  labelValue("Atención", snapshot.event?.name ?? project?.name, 365, 644, 454);
  labelValue("Vendedor", "ORBIT", 365, 630, 454);
  page.drawText("Sin validez tributaria", { x: 365, y: 602, size: 8.6, font: bold, color: black });
  if (dteType === "33") page.drawText("CEDIBLE", { x: 510, y: 602, size: 8.6, font: bold, color: black });

  const tableX = 35, tableY = 180, tableW = 525, tableH = 390, headerH = 24;
  border(tableX, tableY, tableW, tableH, 0.9);
  page.drawRectangle({ x: tableX, y: tableY + tableH - headerH, width: tableW, height: headerH, color: black });
  const cols = [35, 70, 130, 410, 490, 560];
  for (const x of cols.slice(1, -1)) page.drawLine({ start: { x, y: tableY }, end: { x, y: tableY + tableH }, thickness: 0.55, color: line });
  page.drawText("N°", { x: 45, y: tableY + tableH - 16, size: 8.5, font: bold, color: white });
  page.drawText("Cantidad", { x: 82, y: tableY + tableH - 16, size: 8.5, font: bold, color: white });
  page.drawText("Descripción", { x: 242, y: tableY + tableH - 16, size: 8.5, font: bold, color: white });
  page.drawText("Precio U.", { x: 430, y: tableY + tableH - 16, size: 8.5, font: bold, color: white });
  page.drawText("Total", { x: 515, y: tableY + tableH - 16, size: 8.5, font: bold, color: white });
  let rowY = tableY + tableH - headerH - 18;
  lines.slice(0, 14).forEach((item, index) => {
    const quantity = Number(item.quantity ?? 1);
    const unit = Number(item.unitPrice ?? 0);
    page.drawText(String(index + 1), { x: 47, y: rowY, size: 8.2, font: regular, color: black });
    page.drawText(String(quantity), { x: 86, y: rowY, size: 8.2, font: regular, color: black });
    page.drawText(clean(item.description, "Servicio BOOMBOX").slice(0, 46), { x: 138, y: rowY, size: 8.2, font: regular, color: black });
    page.drawText(money(unit).replace("CLP", "").trim(), { x: 425, y: rowY, size: 8.2, font: regular, color: black });
    page.drawText(money(quantity * unit).replace("CLP", "").trim(), { x: 502, y: rowY, size: 8.2, font: regular, color: black });
    page.drawLine({ start: { x: tableX, y: rowY - 6 }, end: { x: tableX + tableW, y: rowY - 6 }, thickness: 0.35, color: line });
    rowY -= 22;
  });

  const descriptionCenter = (cols[2] + cols[3]) / 2;
  let partnerStrip;
  try { partnerStrip = await pdf.embedPng(await readFile(join(process.cwd(), "public/branding/boombox-partner-strip-classic.png"))); } catch { partnerStrip = null; }
  if (partnerStrip) {
    const strip = partnerStrip.scaleToFit(440, 32);
    page.drawImage(partnerStrip, {
      // The visible marks span 33–906 in the 1000 px artwork.
      x: descriptionCenter - strip.width * 0.4695,
      y: 162 - strip.height / 2,
      ...strip,
    });
  } else {
    const fallbackEnd = 372 + bold.widthOfTextAtSize("PIXMEDIA", 12);
    const offset = descriptionCenter - (78 + fallbackEnd) / 2;
    page.drawText("Powered by", { x: 78 + offset, y: 151, size: 8.5, font: regular, color: black });
    page.drawLine({ start: { x: 141 + offset, y: 147 }, end: { x: 141 + offset, y: 164 }, thickness: 0.7, color: line });
    page.drawText("BOOMBOX®", { x: 157 + offset, y: 148, size: 13, font: bold, color: black });
    page.drawLine({ start: { x: 244 + offset, y: 147 }, end: { x: 244 + offset, y: 164 }, thickness: 0.7, color: line });
    page.drawText("ORBIT", { x: 260 + offset, y: 149, size: 11, font: bold, color: black });
    page.drawLine({ start: { x: 355 + offset, y: 147 }, end: { x: 355 + offset, y: 164 }, thickness: 0.7, color: line });
    page.drawText("PIXMEDIA", { x: 372 + offset, y: 149, size: 12, font: bold, color: black });
  }

  page.drawRectangle({ x: 55, y: 58, width: 190, height: 66, color: black });
  for (let i = 0; i < 44; i++) {
    const xx = 60 + ((i * 17) % 180);
    page.drawRectangle({ x: xx, y: 63, width: (i % 3) + 1, height: 56, color: white });
  }
  page.drawText("Timbre electrónico SII · Muestra", { x: 83, y: 45, size: 8.3, font: bold, color: black });
  page.drawText("Nombre: __________________   RUT: __________   Fecha: _________   Recinto: __________   Firma: __________", { x: 35, y: 32, size: 5.7, font: regular, color: black });
  page.drawText("El acuse de recibo acredita la recepción de mercaderías o servicios conforme a la Ley 19.983.", { x: 35, y: 23, size: 5.7, font: regular, color: black });

  border(380, 62, 175, 82, 0.8);
  page.drawLine({ start: { x: 380, y: 117 }, end: { x: 555, y: 117 }, thickness: 0.6, color: line });
  page.drawLine({ start: { x: 380, y: 90 }, end: { x: 555, y: 90 }, thickness: 0.6, color: line });
  page.drawLine({ start: { x: 468, y: 62 }, end: { x: 468, y: 144 }, thickness: 0.6, color: line });
  page.drawText("Neto $", { x: 425, y: 126, size: 8.8, font: regular, color: black });
  page.drawText(money(net), { x: 486, y: 126, size: 8.8, font: regular, color: black });
  page.drawText("19% IVA $", { x: 413, y: 99, size: 8.8, font: regular, color: black });
  page.drawText(money(vat), { x: 486, y: 99, size: 8.8, font: regular, color: black });
  page.drawText("Total $", { x: 424, y: 72, size: 10.5, font: bold, color: black });
  page.drawText(money(total), { x: 486, y: 72, size: 10.5, font: bold, color: black });

  const bytes = await pdf.save();
  return new NextResponse(bytes as BodyInit, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="BOOMBOX-PRE-SII-${dteType}-${clean(draft.invoice_number)}.pdf"`, "Cache-Control": "no-store" } });
}
