"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { FileDown, Mail, RefreshCw, Send, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOfficialRosterPreviewAction, downloadOfficialRosterAction, sendOfficialRosterAction } from "./official-staff-roster.actions";
import type { RosterComposer } from "./official-staff-roster";

export function OfficialStaffRosterControl({projectId}:{projectId:string}) {
  const [composer,setComposer]=useState<RosterComposer|null>(null);
  const [loading,setLoading]=useState(true);
  const [pending,startTransition]=useTransition();
  const [feedback,setFeedback]=useState("");
  const [mailOpen,setMailOpen]=useState(false);
  const [expandedSections,setExpandedSections]=useState<string[]>([]);
  const toggleSection=(key:string)=>setExpandedSections(previous=>previous.includes(key)?previous.filter(item=>item!==key):[...previous,key]);
  const [to,setTo]=useState("");
  const [sendState,setSendState]=useState<"idle"|"sending"|"sent"|"error">("idle");

  const refresh=async()=>{
    setLoading(true);
    const result=await getOfficialRosterPreviewAction(projectId);
    setLoading(false);
    if(!result.ok){setFeedback(result.error);return;}
    setComposer(result.composer);
    setFeedback("");
  };
  useEffect(()=>{void refresh();},[projectId]);

  const download=()=>{
    if(pending||!composer?.canGenerate)return;
    startTransition(async()=>{
      const result=await downloadOfficialRosterAction(projectId);
      if(!result.ok){setFeedback(result.error);return;}
      const raw=atob(result.base64);
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes as unknown as BlobPart],{type:"application/pdf"}));
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=result.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setFeedback("PDF descargado.");
    });
  };
  const openMail=()=>{
    if(!composer?.canGenerate)return;
    setTo(composer.recipient);
    setSendState("idle");
    setMailOpen(true);
  };
  const send=()=>{
    if(!composer||!composer.canGenerate||!to.trim()||pending)return;
    setSendState("sending");
    const requestId=crypto.randomUUID();
    startTransition(async()=>{
      const result=await sendOfficialRosterAction({projectId,requestId,fingerprint:composer.fingerprint,to});
      if(!result.ok){setSendState("error");setFeedback(result.error);return;}
      setSendState("sent");setFeedback(result.message);
      await refresh();
    });
  };

  return <section className="mt-5 rounded-2xl border border-brand/20 bg-background p-4 sm:p-5" aria-labelledby="official-roster-title">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><UsersRound className="size-5"/></span>
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted">STAFF · DOCUMENTO PARA CLIENTE</p><h3 id="official-roster-title" className="mt-1 text-lg font-semibold">Nómina oficial del equipo</h3><p className="mt-1 text-sm text-muted">Operadores, supervisores y encargado del evento. Solo nombres y RUT, sin valores.</p></div>
      </div>
      <div className="flex flex-wrap gap-2"><Link href={"/admin/totems/"+projectId} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Configurar Multicaja</Link><Button variant="outline" disabled={pending||loading} onClick={()=>void refresh()}><RefreshCw className="size-4"/>Actualizar</Button></div>
    </header>
    {feedback&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">{feedback}</p>}
    {loading?<p className="mt-4 text-sm text-muted">Cargando asignaciones del evento…</p>:composer&&<>
      <div className="mt-4 space-y-3">
        {Array.from(new Set(composer.members.map(member => member.block))).map(block => {
          const members = composer.members.filter(member => member.block === block);
          const key = "staff:" + block;
          const expanded = expandedSections.includes(key);
          return <section key={key} className="overflow-hidden rounded-xl border">
            <button type="button" aria-expanded={expanded} onClick={() => toggleSection(key)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/20">
              <span><strong className="block">{block}</strong><span className="text-xs text-muted">{members.length} integrantes</span></span>
              <span className="text-sm text-brand">{expanded ? "Cerrar −" : "Ver integrantes +"}</span>
            </button>
            {expanded && <div className="space-y-2 border-t p-3">{members.map(member => <div key={member.assignmentId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(120px,.7fr)_auto] sm:items-center">
              <div><p className="font-medium">{member.name}</p><p className="text-xs text-muted">{member.roleLabel} · {member.rut || "RUT pendiente"}</p></div>
              <p className="text-xs text-muted">{member.block}</p><p className="text-xs text-muted">Estado: {member.status}</p>
            </div>)}</div>}
          </section>;
        })}
        {!composer.members.length && <p className="rounded-xl border p-4 text-sm text-muted">Aún no hay staff asignado al evento.</p>}
        {!!composer.totemRows?.length && <section className="overflow-hidden rounded-xl border">
          <button type="button" aria-expanded={expandedSections.includes("multicaja")} onClick={() => toggleSection("multicaja")} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/20">
            <span><strong className="block">Distribución Multicaja · PDF oficial</strong><span className="text-xs text-muted">{composer.totemRows.length} asignaciones por posición y bloque</span></span>
            <span className="text-sm text-brand">{expandedSections.includes("multicaja") ? "Cerrar −" : "Ver distribución +"}</span>
          </button>
          {expandedSections.includes("multicaja") && <div className="grid gap-2 border-t p-3">{composer.totemRows.map((row,index) => <div key={index} className="grid gap-1 rounded-lg border p-3 text-sm sm:grid-cols-4"><span className="font-medium">{row.position} · {row.box}</span><span>{row.block}</span><span>{row.operator}</span><span className="text-muted">{row.location} · {row.reference}</span></div>)}</div>}
        </section>}
      </div>
      {!!composer.missing.length&&<div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Completa esto antes de generar o enviar:</strong><ul className="mt-2 list-disc pl-5">{composer.missing.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending||!composer.canGenerate} onClick={download}><FileDown className="size-4"/>Descargar PDF oficial</Button>
        <Button variant="outline" disabled={pending||!composer.canGenerate} onClick={openMail}><Mail className="size-4"/>Enviar por correo</Button>
      </div>
    </>}
    {mailOpen&&composer&&<div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-3" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&sendState!=="sending")setMailOpen(false);}}>
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="roster-mail-title">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">BOOMBOX · CORREO PREMIUM</p><h3 id="roster-mail-title" className="mt-2 text-xl font-semibold">Enviar nómina oficial</h3>
        <label className="mt-4 grid gap-1 text-sm font-medium">Correo del cliente<input type="email" className="min-h-11 rounded-lg border bg-background px-3" value={to} onChange={event=>setTo(event.target.value)} placeholder="cliente@empresa.cl"/></label>
        <div className="mt-3 rounded-xl border bg-muted/10 p-4 text-sm">
          <p><strong>Asunto:</strong> Nómina oficial BOOMBOX · {composer.eventName}</p>
          <p className="mt-2"><strong>Mensaje:</strong> Hola {composer.customerName||"equipo"}, adjuntamos la nómina oficial del equipo BOOMBOX para {composer.eventName}, el {composer.eventDate}. El PDF presenta al equipo organizado por operadores y supervisores.</p>
          <p className="mt-2"><strong>Encargado del evento:</strong> Matías Maira · RUT 16.357.402-0 · +56 9 7306 9315</p>
          <p className="mt-3 text-xs text-muted">Adjunto: nómina oficial en PDF ({composer.members.length} integrantes). El envío quedará registrado en el historial del evento.</p>
        </div>
        {sendState==="sent"&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</p>}
        {sendState==="error"&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{feedback}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={sendState==="sending"} onClick={()=>setMailOpen(false)}>Cerrar</Button><Button disabled={pending||sendState==="sending"||sendState==="sent"||!to.trim()} onClick={send}><Send className="size-4"/>{sendState==="sending"?"Enviando…":sendState==="sent"?"Enviado":"Enviar correo"}</Button></div>
      </section>
    </div>}
  </section>;
}
