"use client";

import Link from "next/link";
import { ExternalLink, FileText, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { OrbitDocumentViewer } from "@/components/documents/orbit-document-viewer";
import { CustomerPurchaseOrderCenter, type CustomerPurchaseOrderRow } from "@/features/commercial-documents/customer-purchase-order-center";
import { ExternalTaxDocumentsCenter, type ExternalTaxDocumentRow } from "./external-tax-documents-center";
import { AgreementSigningControl } from "@/features/projects/signing/agreement-signing-control";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { Button } from "@/components/ui/button";
import { inspectOriginalQuoteResendAction, resendOriginalQuoteAction } from "@/features/projects/actions/original-quote-resend.actions";

type DocumentRow={id:string;type:string;href?:string;createdAt:string;number?:string;originalFilename?:string;fileSize?:number;driveArchiveStatus?:string;version?:number;isCurrent?:boolean};
type HubProps={projectId:string;customerName:string;customerTaxId?:string;customerKind:"PARTICULAR"|"EMPRESA";quotation?:{id:string;number:string;status:string;revision:number;acceptedAt:string;total:number;detailHref:string;pdfHref:string;acceptedVersionId?:string;items:readonly {label:string;quantity:number;total:number}[]};contract:{agreementId?:string;quotationId?:string;status:string;href?:string;createdAt?:string;signedAt?:string};receivable?:{id:string;paid:number;outstanding:number;dueDate:string|null;status:string};paymentCondition:string;documents:readonly DocumentRow[];taxDocuments:readonly ExternalTaxDocumentRow[]};
const money=(value:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(value);
const date=(value:string)=>new Date(value).toLocaleDateString("es-CL");
const labels:Record<string,string>={QUOTATION:"Cotización",AGREEMENT:"Contrato",SIGNED_AGREEMENT:"Contrato firmado",COMMERCIAL_DOCUMENT:"Documento comercial",PAYMENT_RECEIPT:"Comprobante de pago",EXTERNAL_TAX_DOCUMENT:"Documento SII",CUSTOMER_PURCHASE_ORDER:"OC Cliente",DESIGN:"Diseño",PHOTO_STRIP_DESIGN:"Diseño tira de fotos",GALLERY:"Galería",BACKUP:"Respaldo"};

export function EventCommercialDocumentHub(props:HubProps){
  const[viewer,setViewer]=useState<{title:string;src:string}|null>(null);
  const[original,setOriginal]=useState<{available:boolean;href?:string;downloadHref?:string;version?:number;error?:string;history:readonly {id:string;status:string;sentAt:string|null;recipient:string;subject:string;messageId:string|null}[]}>({available:false,history:[]});
  const[resendOpen,setResendOpen]=useState(false);
  const[recipient,setRecipient]=useState("");
  const[resendMessage,setResendMessage]=useState("");
  const[resending,setResending]=useState(false);
  const[historyOpen,setHistoryOpen]=useState(false);
  const[requestId,setRequestId]=useState("");
  const receipts=props.documents.filter(item=>item.type==="PAYMENT_RECEIPT");
  const purchaseOrder=props.documents.find(item=>item.type==="CUSTOMER_PURCHASE_ORDER");
  const other=props.documents.filter(item=>!["QUOTATION","AGREEMENT","SIGNED_AGREEMENT","COMMERCIAL_DOCUMENT","PAYMENT_RECEIPT","EXTERNAL_TAX_DOCUMENT","CUSTOMER_PURCHASE_ORDER"].includes(item.type));
  const commercialDocuments=props.documents.filter(item=>item.type==="COMMERCIAL_DOCUMENT").sort((a,b)=>(b.version??0)-(a.version??0));
  const currentCommercialDocument=commercialDocuments.find(item=>item.isCurrent) ?? commercialDocuments[0];
  const quotationReady=Boolean(props.quotation&&["ACCEPTED","CONVERTED"].includes(props.quotation.status));
  const contractReady=["SIGNED","COMMERCIAL_DOCUMENT"].includes(props.contract.status);
  const taxReady=props.taxDocuments.length>0;
  const paymentState=(props.receivable?.outstanding??0)<=0&&props.receivable?"PAGADO":(props.receivable?.paid??0)>0?"PARCIAL":"PENDIENTE";
  const ocState=purchaseOrder?"RECIBIDA":props.customerKind==="PARTICULAR"?"NO REQUERIDA":"PENDIENTE";
  const poRow:CustomerPurchaseOrderRow|undefined=purchaseOrder&&purchaseOrder.href?{id:purchaseOrder.id,number:purchaseOrder.number,originalFilename:purchaseOrder.originalFilename,fileSize:purchaseOrder.fileSize,createdAt:purchaseOrder.createdAt,href:purchaseOrder.href,driveArchiveStatus:purchaseOrder.driveArchiveStatus}:undefined;
  const quoteId=props.quotation?.id;
  useEffect(()=>{
    if(!quoteId) return;
    setRecipient("");
    void inspectOriginalQuoteResendAction(props.projectId,quoteId).then((result)=>{
      if(result.ok) setOriginal({available:true,href:result.href,downloadHref:result.downloadHref,version:result.version,history:result.history});
      else setOriginal({available:false,error:result.error,history:[]});
    });
  },[props.projectId,quoteId]);
  const resend=()=>{
    if(!quoteId||resending||!recipient.trim()) return;
    setResending(true); setResendMessage("");
    void resendOriginalQuoteAction({projectId:props.projectId,quoteId,recipientEmail:recipient,requestId:requestId||crypto.randomUUID()}).then((result)=>{
      setResendMessage(result.ok?result.message:result.error);
      if(result.ok){setResendOpen(false);setRequestId(crypto.randomUUID());void inspectOriginalQuoteResendAction(props.projectId,quoteId).then((next)=>{if(next.ok)setOriginal({available:true,href:next.href,downloadHref:next.downloadHref,version:next.version,history:next.history});});}
      else setRequestId(crypto.randomUUID());
      setResending(false);
    });
  };
  return <div className="min-w-0 space-y-6" data-event-commercial-document-hub>
    <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Archivo permanente del Evento</p><h3 className="mt-1 text-2xl font-semibold">DOCUMENTOS COMERCIALES</h3><p className="mt-1 text-sm text-muted">Supabase y cada módulo propietario conservan la verdad canónica; Drive es sólo archivo administrativo.</p></div>
    <section className="rounded-2xl border bg-background/30 p-4"><h4 className="font-semibold">Progreso comercial</h4><div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"><Progress label="COTIZACIÓN" value={quotationReady?"✓":"PENDIENTE"}/><Progress label="OC CLIENTE" value={ocState}/><Progress label="CONTRATO" value={contractReady?"✓":"PENDIENTE"}/><Progress label="FACTURA / SII" value={taxReady?"✓":"PENDIENTE"}/><Progress label="PAGO" value={paymentState}/></div></section>
    <section className="rounded-xl border p-4"><h4 className="font-semibold">COTIZACIÓN</h4>{props.quotation?<div className="mt-3 space-y-3"><dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Datum label="Número" value={props.quotation.number}/><Datum label="Versión aceptada" value={original.version?`V${original.version}`:"Verificando…"}/><Datum label="Aceptada" value={date(props.quotation.acceptedAt)}/><Datum label="Total" value={money(props.quotation.total)}/></dl><div className="space-y-2">{props.quotation.items.map((item,index)=><div className="flex min-w-0 justify-between gap-3 rounded-lg bg-background/40 p-3 text-sm" key={`${item.label}-${index}`}><span className="min-w-0 break-words">{item.label} · {item.quantity}</span><strong>{money(item.total)}</strong></div>)}</div><div className="flex flex-wrap gap-3">{original.available?<><a className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand" href={original.href} rel="noreferrer" target="_blank">VER COTIZACIÓN ORIGINAL<ExternalLink className="size-4"/></a><a className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand" href={original.downloadHref}>DESCARGAR PDF ORIGINAL</a><Button onClick={()=>{setRecipient("");setRequestId(crypto.randomUUID());setResendMessage("");setResendOpen(true);}} variant="outline">REENVIAR COTIZACIÓN FORMAL</Button></>:<span className="text-sm text-amber-600">{original.error??"Verificando PDF original…"}</span>}</div>{original.history.length?<div className="mt-3"><button className="text-sm font-semibold text-brand" onClick={()=>setHistoryOpen((value)=>!value)} type="button">HISTORIAL DE ENVÍOS · {original.history.length}</button>{historyOpen?<div className="mt-2 space-y-2 rounded-lg border p-3 text-sm">{original.history.map((item)=><div className="flex flex-wrap justify-between gap-2" key={item.id}><span>{item.recipient} · {item.sentAt?date(item.sentAt):"—"}</span><strong>{item.status}</strong></div>)}</div>:null}</div>:null}</div>:<p className="mt-3 text-sm text-muted">No existe una cotización vinculada.</p>}</section>
    <CustomerPurchaseOrderCenter document={poRow} onPreview={(row)=>setViewer({title:row.originalFilename||"OC Cliente",src:row.href})} projectId={props.projectId}/>
    <section className="rounded-xl border bg-card p-4" aria-label="Documentos y confirmación"><h4 className="font-semibold">DOCUMENTOS Y CONFIRMACIÓN</h4><p className="mt-2 text-sm text-muted">Documento vigente, historial y confirmación bajo acción explícita del Founder.</p><div className="mt-3 flex flex-wrap gap-3">{currentCommercialDocument?.href?<button className="inline-flex min-h-11 items-center font-semibold text-brand" onClick={()=>setViewer({title:"Documento comercial vigente",src:currentCommercialDocument.href!})} type="button">VER DOCUMENTO VIGENTE</button>:props.contract.href?<button className="inline-flex min-h-11 items-center font-semibold text-brand" onClick={()=>setViewer({title:"Contrato del Evento",src:props.contract.href!})} type="button">VER DOCUMENTO VIGENTE</button>:null}<span className="inline-flex min-h-11 items-center text-sm text-muted">{props.contract.status === "SIGNED" ? "Contrato firmado protegido" : currentCommercialDocument ? `Versión ${currentCommercialDocument.version??1}` : "Documento pendiente"}</span></div>{commercialDocuments.length>1?<div className="mt-3 space-y-1 text-xs text-muted">{commercialDocuments.map(item=><p key={item.id}>{item.isCurrent?"Vigente":"Histórico"} · versión {item.version??1} · {date(item.createdAt)}</p>)}</div>:null}<div className="mt-5"><AgreementSigningControl agreementId={props.contract.agreementId} quotationId={props.contract.quotationId} projectId={props.projectId} status={props.contract.status}/></div></section>
    <ExternalTaxDocumentsCenter projectId={props.projectId} invoiceId={props.receivable?.id} customerName={props.customerName} customerTaxId={props.customerTaxId} documents={props.taxDocuments} onPreview={(row)=>row.href&&setViewer({title:`${row.taxType.replaceAll("_"," ")} Nº ${row.folio}`,src:row.href})}/>
    <section className="grid gap-4 lg:grid-cols-2"><DocumentGroup icon={<ReceiptText className="size-5"/>} onPreview={(row)=>row.href&&setViewer({title:labels[row.type]??"Documento del Evento",src:row.href})} title="COMPROBANTES DE PAGO" rows={receipts}/><DocumentGroup icon={<FileText className="size-5"/>} onPreview={(row)=>row.href&&setViewer({title:labels[row.type]??"Documento del Evento",src:row.href})} title="OTROS" rows={other}/></section>
    <nav className="flex flex-wrap gap-2" aria-label="Acciones comerciales rápidas"><Action href="#payment-management">Registrar pago</Action><Action href="#payment-management">Ver comprobantes</Action><Action href="/finance/receivables">Ir a Accounts Receivable</Action></nav>
    {viewer?<OrbitDocumentViewer onClose={()=>setViewer(null)} src={viewer.src} title={viewer.title}/>:null}
    {resendOpen?<MobileDialog description="El PDF adjunto será exactamente la versión aceptada almacenada. No se modificará la cotización ni el evento." dismissOnOverlayClick={false} eyebrow="DOCUMENTOS Y ENVÍOS" onClose={()=>{if(!resending)setResendOpen(false)}} size="md" title="Reenviar cotización formal" variant="fullscreen-mobile"><div className="space-y-4"><p className="text-sm text-muted">Confirma el destinatario para este envío. El correo principal del cliente no será modificado.</p><label className="block text-sm font-medium">DESTINATARIO<input autoFocus className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" disabled={resending} onChange={(event)=>setRecipient(event.target.value)} placeholder="cliente@empresa.cl" type="email" value={recipient}/></label>{resendMessage?<p aria-live="polite" className="text-sm font-medium">{resendMessage}</p>:null}<div className="flex justify-end gap-2"><Button disabled={resending} onClick={()=>setResendOpen(false)} variant="outline">Cancelar</Button><Button disabled={resending||!recipient.trim()} onClick={resend}>{resending?"Enviando…":"Confirmar envío"}</Button></div></div></MobileDialog>:null}
  </div>
}
function Progress({label,value}:{label:string;value:string}){const ready=value==="✓"||value==="RECIBIDA"||value==="PAGADO"||value==="NO REQUERIDA";return <div className="rounded-xl border p-3"><p className="text-xs font-semibold text-muted">{label}</p><p className={`mt-1 font-semibold ${ready?"text-success":"text-amber-600"}`}>{value}</p></div>}
function Datum({label,value}:{label:string;value:string}){return <div><dt className="text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>}
function Action({href,children}:{href:string;children:React.ReactNode}){return <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition hover:border-brand" href={href}>{children}</Link>}
function DocumentGroup({icon,title,rows,onPreview}:{icon:React.ReactNode;title:string;rows:readonly DocumentRow[];onPreview:(row:DocumentRow)=>void}){return <section className="rounded-xl border p-4"><h4 className="flex items-center gap-2 font-semibold">{icon}{title}</h4><div className="mt-3 space-y-2">{rows.length?rows.map(row=><article className="flex items-center justify-between gap-3 rounded-lg bg-background/40 p-3" key={row.id}><div><p className="text-sm font-medium">{labels[row.type]??row.type.replaceAll("_"," ")}</p><p className="text-xs text-muted">{date(row.createdAt)}</p></div>{row.href?<button className="min-h-11 text-sm font-semibold text-brand" onClick={()=>onPreview(row)} type="button">VER DOCUMENTO</button>:<span className="text-xs text-muted">Protegido</span>}</article>):<p className="text-sm text-muted">Sin documentos en esta categoría.</p>}</div></section>}
