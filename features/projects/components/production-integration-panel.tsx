"use client";

import { useState, useTransition } from "react";
import { CalendarSync, CheckCircle2, FileOutput, RotateCcw, XCircle } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { approveQuotationAction } from "@/features/quotation-engine";
import { synchronizeProjectCalendarAction } from "@/features/connectors/google-calendar";

export type ReadinessState = "READY" | "ATTENTION" | "ACTION_REQUIRED";
export interface ReadinessItem { label:string; state:ReadinessState; detail:string; }
export interface ProductionIntegrationPanelProps {
  projectId:string;
  quotation?:{id:string;status:string;pdfReady:boolean;driveReady:boolean;gmailDraftReady:boolean};
  calendar:{status:string;googleEventId?:string;googleEventUrl?:string};
  readiness:readonly ReadinessItem[];
}

const presentation:Record<ReadinessState,{label:string;variant:"success"|"warning"|"danger"}>={READY:{label:"Listo",variant:"success"},ATTENTION:{label:"Requiere atención",variant:"warning"},ACTION_REQUIRED:{label:"Acción requerida",variant:"danger"}};

export function ProductionIntegrationPanel({projectId,quotation,calendar,readiness}:ProductionIntegrationPanelProps){
  const [pending,startTransition]=useTransition(); const [feedback,setFeedback]=useState("");
  const approve=()=>quotation&&startTransition(async()=>{const result=await approveQuotationAction(quotation.id);setFeedback(result.ok?result.message:result.error);});
  const sync=(operation:"UPSERT"|"CANCEL"|"RESTORE")=>startTransition(async()=>{const result=await synchronizeProjectCalendarAction(projectId,operation);setFeedback(result.ok?`Google Calendar: ${result.operation.toLowerCase()}.`:result.error);});
  return <section aria-labelledby="event-readiness" className="rounded-2xl border bg-card p-5 sm:p-6">
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Control operacional</p><h2 className="mt-2 text-xl font-semibold tracking-tight" id="event-readiness">Preparación del evento</h2><p className="mt-2 text-sm text-muted">Visibilidad operacional en tiempo real. Ningún estado bloquea la operación.</p></div><StatusBadge label={readiness.every((item)=>item.state==="READY")?"Listo":readiness.some((item)=>item.state==="ACTION_REQUIRED")?"Acción requerida":"Requiere atención"} variant={readiness.every((item)=>item.state==="READY")?"success":readiness.some((item)=>item.state==="ACTION_REQUIRED")?"danger":"warning"}/></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{readiness.map((item)=><div className="rounded-xl border bg-background/35 p-4" key={item.label}><div className="flex items-start justify-between gap-3"><p className="font-medium">{item.label}</p><StatusBadge label={presentation[item.state].label} variant={presentation[item.state].variant}/></div><p className="mt-2 text-xs leading-5 text-muted">{item.detail}</p></div>)}</div>
    <div className="mt-6 grid gap-4 border-t pt-5 lg:grid-cols-2"><div className="rounded-xl border p-4"><div className="flex items-center gap-3"><FileOutput className="size-5 text-brand"/><div><p className="font-semibold">Pipeline de cotización</p><p className="text-xs text-muted">PDF final · Google Drive · borrador Gmail</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge label={quotation?.status??"Sin cotización"} variant={quotation?.status==="ACCEPTED"?"success":"warning"}/>{quotation?.pdfReady&&<StatusBadge label="PDF" variant="success"/>}{quotation?.driveReady&&<StatusBadge label="Drive" variant="success"/>}{quotation?.gmailDraftReady&&<StatusBadge label="Gmail" variant="success"/>}</div>{quotation&&quotation.status!=="ACCEPTED"&&<ActionButton className="mt-4" disabled={pending} icon={CheckCircle2} label="Aprobar y preparar documentos" onClick={approve}/>}</div>
      <div className="rounded-xl border p-4"><div className="flex items-center gap-3"><CalendarSync className="size-5 text-brand"/><div><p className="font-semibold">Google Calendar</p><p className="text-xs text-muted">{calendar.googleEventId??"Evento aún no sincronizado"}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge label={calendar.status} variant={calendar.status==="SYNCHRONIZED"?"success":calendar.status==="CANCELLED"?"warning":"neutral"}/></div><div className="mt-4 flex flex-wrap gap-2"><ActionButton disabled={pending} icon={CalendarSync} label={calendar.googleEventId?"Sincronizar nuevamente":"Crear evento"} onClick={()=>sync("UPSERT")}/>{calendar.googleEventId&&calendar.status!=="CANCELLED"&&<ActionButton disabled={pending} icon={XCircle} label="Cancelar" onClick={()=>sync("CANCEL")} variant="outline"/>}{calendar.status==="CANCELLED"&&<ActionButton disabled={pending} icon={RotateCcw} label="Restaurar" onClick={()=>sync("RESTORE")} variant="outline"/>}</div></div></div>
    {feedback&&<p aria-live="polite" className="mt-4 rounded-xl border bg-background/40 px-4 py-3 text-sm">{feedback}</p>}
  </section>;
}
