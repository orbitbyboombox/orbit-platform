import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireTributaryAccess } from "@/features/tributary/access";
import { renderTaxPdf } from "../../../../../orbit-sii-preview/lib/tax-pdf.mjs";

export const runtime = "nodejs";
const brands = ["boombox","orbit","pixmedia"];
const money = (amount: unknown) => {
  if ((typeof amount !== "number" && typeof amount !== "string") || !/^\d+(?:\.0+)?$/.test(String(amount))) throw new Error();
  const n = Number(amount);
  if (!Number.isSafeInteger(n) || n > 999_999_999_999) throw new Error();
  return n;
};
const label = (value: unknown) => typeof value === "string" ? value.trim().slice(0,140) : "";

type RawDocument = { kind:number; snapshot:Record<string,unknown> };

function dispatchSnapshot(raw:Record<string,unknown>) {
  const transport=raw.dispatch as {trip:string;plate:string;driverName:string;driverRut:string;address:string;city:string;carrierRut:string;origin:string};
  const receiver=raw.receiver as {name:string;rut:string};
  const equipment=raw.equipment as Array<{name:string;quantity:number}>;
  if(!receiver?.name || !receiver.rut || !transport?.plate || !transport.driverRut || !Array.isArray(equipment) || !equipment.length) throw new Error();
  return {type:52,client:receiver.name,rut:receiver.rut,transport,net:0,tax:0,total:0,
    lines:equipment.map((asset)=>({name:asset.name,quantity:asset.quantity,net:0}))};
}

function saleSnapshot(doc:RawDocument) {
  const {quotation,customer,items}=doc.snapshot as {
    quotation?:Record<string,unknown>;customer?:Record<string,unknown>;items?:unknown;
  };
    if (![33,39].includes(doc.kind) || !customer || !quotation || !Array.isArray(items) || !items.length) throw new Error();
    const name=label(customer.legalName ?? customer.companyName ?? customer.name ?? customer.fullName);
    const rut=label(customer.taxId ?? customer.rut ?? customer.tax_id);
    if(!name || !rut) throw new Error();
    const lines=items.map((item: {quantity:unknown; label:unknown; total:unknown; quotedPrice:unknown})=>{
      const quantity=money(item.quantity), unitPrice=money(item.quotedPrice), net=money(item.total);
      const description=label(item.label);
      if(!description || quantity<1 || quantity*unitPrice!==net) throw new Error();
      return {name:description,quantity,unitPrice,net};
    });
    const net=lines.reduce((sum:number,row:{net:number})=>sum+row.net,0);
    const tax=money(quotation.taxTotal), total=money(quotation.grandTotal);
    if (money(quotation.discountTotal)!==0 || net+tax!==total || Math.round(net*19/100)!==tax) throw new Error();
  return {type:doc.kind,client:name,rut,lines,net,tax,total};
}

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  const client = await requireTributaryAccess();
  const { id }=await params;
  if(!/^\d{1,12}$/.test(id)) return new Response(null,{status:404});
  const {data:doc,error}=await client.rpc("orbit_tributary_document",{p_id:Number(id)});
  if(error || !doc) return new Response(null,{status:404});
  try {
    const snapshot=doc.kind===52 ? dispatchSnapshot(doc.snapshot) : saleSnapshot(doc);
    const logos=Object.fromEntries(await Promise.all(brands.map(async (brand)=>[brand,
      (await readFile(join(process.cwd(),"orbit-sii-preview","branding",`${brand}-black.png`))).toString("base64")])));
    const issuer={legalName:"PRODUCCIONES BOOM BOX COMPANY SPA",rut:"76.565.272-3",
      activity:"Producción de todo tipo de eventos, transporte de carga por carretera",
      address:"Puerta Oriente 361, of. 310 C, torre C",city:"Colina",office:"Santiago Norte",
      email:"contacto@bbox.cl",website:"www.bbox.cl"};
    const pdf:Uint8Array=await renderTaxPdf({folio:"POR ASIGNAR",issueDate:String(doc.created_at).slice(0,10),
      snapshot}, {issuer,logos,syntheticStamp:undefined});
    return new Response(new Uint8Array(pdf),{headers:{
      "Content-Type":"application/pdf","Content-Disposition":'inline; filename="orbit-borrador-sin-validez.pdf"',
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    }});
  } catch {
    return new Response(doc.kind===52 ? "El traslado necesita revisar sus datos antes de producir el PDF." : "La cotización necesita validar su desglose fiscal antes de producir el PDF.",{status:422});
  }
}
