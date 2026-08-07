import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface QuotationPdfInput {
  quotationNumber: string; issueDate: string; expirationDate: string; customer: string; project: string;
  eventDate: string; location: string; subtotal: number; transport: number; taxes: number; total: number;
  items: readonly { label: string; quantity: number; total: number }[];
  branding:{productName:string;productVersion:string;brandName:string;developedBy:string;poweredBy:string;footer:string;currency:string;locale:string};
}

const money = (value: number,locale:string,currency:string) => new Intl.NumberFormat(locale,{style:"currency",currency,maximumFractionDigits:0}).format(value);
const safe = (value: string) => value.replace(/[^\x20-\x7EÀ-ÿ]/g, " ");

export async function createQuotationPdf(input: QuotationPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.08,0.09,0.11); const orange = rgb(0.96,0.55,0.12); const muted = rgb(0.35,0.37,0.42);
  page.drawRectangle({ x:0,y:760,width:595.28,height:81.89,color:dark });
  page.drawText(safe(`${input.branding.productName} by ${input.branding.brandName}`), { x:42,y:795,size:20,font:bold,color:orange });
  page.drawText("Cotización comercial", { x:42,y:774,size:10,font,color:rgb(0.9,0.9,0.9) });
  page.drawText(safe(input.quotationNumber), { x:42,y:718,size:18,font:bold,color:dark });
  page.drawText(`Emisión: ${input.issueDate}  ·  Vigencia: ${input.expirationDate}`, { x:42,y:696,size:9,font,color:muted });
  const rows = [["Cliente",input.customer],["Proyecto",input.project],["Fecha del evento",input.eventDate],["Lugar",input.location]] as const;
  let y=655; for (const [label,value] of rows) { page.drawText(label.toUpperCase(),{x:42,y,size:8,font:bold,color:muted}); page.drawText(safe(value).slice(0,80),{x:180,y,size:10,font,color:dark}); y-=28; }
  y-=10; page.drawLine({start:{x:42,y},end:{x:553,y},thickness:0.8,color:rgb(0.82,0.83,0.85)}); y-=30;
  for (const item of input.items.slice(0,12)) { page.drawText(`${safe(item.label)} × ${item.quantity}`,{x:42,y,size:10,font,color:dark}); page.drawText(money(item.total,input.branding.locale,input.branding.currency),{x:455,y,size:10,font:bold,color:dark}); y-=24; }
  y-=12; page.drawLine({start:{x:330,y},end:{x:553,y},thickness:0.8,color:rgb(0.82,0.83,0.85)}); y-=24;
  for (const [label,value] of [["Subtotal",input.subtotal],["Transporte",input.transport],["IVA",input.taxes]] as const) { page.drawText(label,{x:350,y,size:9,font,color:muted}); page.drawText(money(value,input.branding.locale,input.branding.currency),{x:455,y,size:9,font,color:dark}); y-=21; }
  y=Math.max(82,y); page.drawText("TOTAL",{x:350,y,size:11,font:bold,color:dark}); page.drawText(money(input.total,input.branding.locale,input.branding.currency),{x:455,y,size:12,font:bold,color:orange});
  page.drawText(safe(input.branding.footer||`${input.branding.productName} ${input.branding.productVersion} · Developed by ${input.branding.developedBy} · Powered by ${input.branding.poweredBy}`),{x:42,y:48,size:8,font,color:muted});
  return pdf.save();
}
