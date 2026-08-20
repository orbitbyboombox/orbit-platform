"use client";

import Link from "next/link";
import { ExternalLink, FileText, ReceiptText } from "lucide-react";
import { ExternalTaxDocumentsCenter, type ExternalTaxDocumentRow } from "./external-tax-documents-center";

type DocumentRow={id:string;type:string;href?:string;createdAt:string};
type HubProps={projectId:string;customerName:string;customerTaxId?:string;customerKind:"PARTICULAR"|"EMPRESA";quotation?:{number:string;status:string;href?:string};contract:{status:string;href?:string};receivable?:{id:string;paid:number;outstanding:number;dueDate:string|null;status:string};paymentCondition:string;documents:readonly DocumentRow[];taxDocuments:readonly ExternalTaxDocumentRow[]};
const money=(value:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(value);
const date=(value:string)=>new Date(value).toLocaleDateString("es-CL");
const labels:Record<string,string>={QUOTATION:"Cotización",AGREEMENT:"Contrato",SIGNED_AGREEMENT:"Contrato firmado",PAYMENT_RECEIPT:"Comprobante de pago",EXTERNAL_TAX_DOCUMENT:"Documento SII",DESIGN:"Diseño",GALLERY:"Galería",BACKUP:"Respaldo"};

export function EventCommercialDocumentHub(props:HubProps){
  const receipts=props.documents.filter(item=>item.type==="PAYMENT_RECEIPT");
  const other=props.documents.filter(item=>!["QUOTATION","AGREEMENT","SIGNED_AGREEMENT","PAYMENT_RECEIPT","EXTERNAL_TAX_DOCUMENT"].includes(item.type));
  const quotationReady=Boolean(props.quotation&&["ACCEPTED","CONVERTED"].includes(props.quotation.status));
  const contractReady=props.contract.status==="SIGNED";
  const taxReady=props.taxDocuments.length>0;
  const paymentReady=(props.receivable?.paid??0)>0;
  return <div className="space-y-5" data-event-commercial-document-hub>
    <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Vista canónica del Evento</p><h3 className="mt-1 text-xl font-semibold">Documentos y estado comercial</h3><p className="mt-1 text-sm text-muted">{props.customerKind}. Una lectura única; cada dato sigue perteneciendo a su módulo propietario.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatusCard label="Cotización" value={props.quotation?`${props.quotation.number} · ${props.quotation.status}`:"No registrada"} state={quotationReady?"READY":props.quotation?"PENDING":"ATTENTION"}/>
      <StatusCard label="Contrato" value={props.contract.status==="SIGNED"?"Firmado":props.contract.status||"Pendiente"} state={contractReady?"READY":"PENDING"}/>
      <StatusCard label="Documento tributario" value={taxReady?`${props.taxDocuments[0].taxType.replaceAll("_"," ")} Nº ${props.taxDocuments[0].folio}`:"Pendiente"} state={taxReady?"READY":"PENDING"}/>
      <StatusCard label="Cobrado" value={money(props.receivable?.paid??0)} state={paymentReady?"READY":"PENDING"}/>
      <StatusCard label="Saldo pendiente" value={money(props.receivable?.outstanding??0)} state={(props.receivable?.outstanding??0)>0?"PENDING":"READY"}/>
      <StatusCard label="Condición de pago" value={`${props.paymentCondition}${props.receivable?.dueDate?` · vence ${date(`${props.receivable.dueDate}T12:00:00Z`)}`:""}`} state={props.paymentCondition.includes("revisión")?"ATTENTION":"READY"}/>
    </div>
    <nav className="flex flex-wrap gap-2" aria-label="Acciones comerciales rápidas">
      {props.quotation?.href?<Action href={props.quotation.href} external>Ver cotización</Action>:null}
      {props.contract.href?<Action href={props.contract.href} external>Ver contrato</Action>:null}
      <Action href="#payment-management">Registrar pago</Action>
      <Action href="#payment-management">Ver comprobantes</Action>
      <Action href="/finance/receivables">Ir a Accounts Receivable</Action>
    </nav>
    <ExternalTaxDocumentsCenter projectId={props.projectId} invoiceId={props.receivable?.id} customerName={props.customerName} customerTaxId={props.customerTaxId} documents={props.taxDocuments}/>
    <div className="grid gap-4 lg:grid-cols-2">
      <DocumentGroup icon={<ReceiptText className="size-5"/>} title="Comprobantes de pago" rows={receipts}/>
      <DocumentGroup icon={<FileText className="size-5"/>} title="Otros documentos del Evento" rows={other}/>
    </div>
  </div>
}
function StatusCard({label,value,state}:{label:string;value:string;state:"READY"|"PENDING"|"ATTENTION"}){const color=state==="READY"?"bg-emerald-500":state==="PENDING"?"bg-amber-400":"bg-red-500";return <article className="rounded-xl border bg-background/30 p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span className={`size-2.5 rounded-full ${color}`}/>{label}</p><p className="mt-2 font-semibold">{value}</p></article>}
function Action({href,external,children}:{href:string;external?:boolean;children:React.ReactNode}){const classes="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition hover:border-brand";return external?<a className={classes} href={href} rel="noreferrer" target="_blank">{children}<ExternalLink className="size-4"/></a>:<Link className={classes} href={href}>{children}</Link>}
function DocumentGroup({icon,title,rows}:{icon:React.ReactNode;title:string;rows:readonly DocumentRow[]}){return <section className="rounded-xl border p-4"><h4 className="flex items-center gap-2 font-semibold">{icon}{title}</h4><div className="mt-3 space-y-2">{rows.length?rows.map(row=><article className="flex items-center justify-between gap-3 rounded-lg bg-background/40 p-3" key={row.id}><div><p className="text-sm font-medium">{labels[row.type]??row.type.replaceAll("_"," ")}</p><p className="text-xs text-muted">{date(row.createdAt)}</p></div>{row.href?<a className="text-sm font-semibold text-brand" href={row.href} rel="noreferrer" target="_blank">Ver</a>:<span className="text-xs text-muted">Protegido</span>}</article>):<p className="text-sm text-muted">Sin documentos en esta categoría.</p>}</div></section>}
