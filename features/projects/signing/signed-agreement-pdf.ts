import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface SignedAgreementPdfInput {
  quotationNumber: string; customer: string; event: string; services: string; hours: string; extras: string;
  venue: string; address: string; signaturePng: Uint8Array; signedAt: string; agreementVersion: string;
}

export async function createSignedAgreementPdf(input: SignedAgreementPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.96, 0.55, 0.12); const dark = rgb(0.08, 0.09, 0.11); const muted = rgb(0.35, 0.37, 0.42);
  page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 81.89, color: dark }); page.drawText("ORBIT by BOOMBOX", { x: 42, y: 795, size: 20, font: bold, color: orange }); page.drawText("Acuerdo digital firmado", { x: 42, y: 774, size: 10, font, color: rgb(0.9,0.9,0.9) });
  page.drawText(`Cotización ${safe(input.quotationNumber)}`, { x: 42, y: 718, size: 18, font: bold, color: dark });
  let y = 680; const rows: Array<[string,string]> = [["Cliente",input.customer],["Evento",input.event],["Servicios",input.services],["Duración",input.hours],["Extras",input.extras],["Lugar",input.venue],["Dirección",input.address],["Versión del acuerdo",input.agreementVersion]];
  for (const [label,value] of rows) { page.drawText(label.toUpperCase(), { x: 42, y, size: 8, font: bold, color: muted }); page.drawText(safe(value).slice(0,88), { x: 180, y, size: 10, font, color: dark }); y -= 32; }
  page.drawLine({ start: { x: 42, y: 392 }, end: { x: 553, y: 392 }, thickness: 0.8, color: rgb(0.82,0.83,0.85) });
  page.drawText("FIRMA DEL CLIENTE", { x: 42, y: 360, size: 8, font: bold, color: muted });
  const signature = await pdf.embedPng(input.signaturePng); const scaled = signature.scale(Math.min(1, 230 / signature.width, 100 / signature.height)); page.drawImage(signature, { x: 42, y: 235, width: scaled.width, height: scaled.height });
  page.drawLine({ start: { x: 42, y: 225 }, end: { x: 300, y: 225 }, thickness: 0.8, color: dark }); page.drawText(safe(input.customer), { x: 42, y: 208, size: 9, font, color: dark });
  page.drawText(`Firmado: ${new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "medium", timeZone: "America/Santiago" }).format(new Date(input.signedAt))}`, { x: 42, y: 178, size: 9, font, color: muted });
  page.drawText("Documento generado por ORBIT v1.0 · Powered by NOVA CORE", { x: 42, y: 48, size: 8, font, color: muted });
  return pdf.save();
}

function safe(value: string): string { return value.replace(/[^\x20-\x7EÀ-ÿ]/g, " "); }
