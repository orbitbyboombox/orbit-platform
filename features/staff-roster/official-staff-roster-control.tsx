"use client";
import { useEffect, useState, useTransition } from "react";
import { FileDown, Mail, RefreshCw, Save, Send, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOfficialRosterPreviewAction, saveOfficialRosterBlockAction, downloadOfficialRosterAction, sendOfficialRosterAction } from "./official-staff-roster.actions";
import type { RosterComposer } from "./official-staff-roster";

export function OfficialStaffRosterControl({projectId}:{projectId:string}) {
  const [composer,setComposer]=useState<RosterComposer|null>(null);
  const [blocks,setBlocks]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [pending,startTransition]=useTransition();
  const [feedback,setFeedback]=useState("");
  const [mailOpen,setMailOpen]=useState(false);
  const [to,setTo]=useState("");
  const [sendState,setSendState]=useState<"idle"|"sending"|"sent"|"error">("idle");

  const refresh=async()=>{
    setLoading(true);
    const result=await getOfficialRosterPreviewAction(projectId);
    setLoading(false);
    if(!result.ok){setFeedback(result.error);return;}
    setComposer(result.composer);
    setBlocks(Object.fromEntries(result.composer.members.map(member=>[member.assignmentId,member.block])));
    setFeedback("");
  };
  useEffect(()=>{void refresh();},[projectId]);

  const saveBlock=(assignmentId:string)=>{
    setFeedback("");
    startTransition(async()=>{
      const result=await saveOfficialRosterBlockAction({projectId,assignmentId,block:blocks[assignmentId]??""});
      if(!result.ok){setFeedback(result.error);return;}
      await refresh();
      setFeedback("Bloque guardado.");
    });
  };
  const download=()=>{
    if(pending||!composer?.canGenerate)return;
    startTransition(async()=>{
      const result=await downloadOfficialRosterAction(projectId);
      if(!result.ok){setFeedback(result.error);return;}
      const raw=atob(result.base64);
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=result.filename;anchor.click();URL.revokeObjectURL(url);
      setFeedback("PDF descargado.");
    });
  };
  const openMail=()=>{
    if(!composer?.canGenerate)return;
    setTo(composer.recipient);
    setSendState("idle");
    setMailOpen(true);
  };
  const hasUnsavedBlocks=!!composer?.members.some(member=>(blocks[member.assignmentId]??"")!==member.block);
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
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted">STAFF · DOCUMENTO PARA CLIENTE</p><h3 id="official-roster-title" className="mt-1 text-lg font-semibold">Nómina oficial del equipo</h3><p className="mt-1 text-sm text-muted">Ordena el equipo por bloques, revisa los RUT y descarga o envía el PDF.</p></div>
      </div>
      <Button variant="outline" disabled={pending||loading} onClick={()=>void refresh()}><RefreshCw className="size-4"/>Actualizar</Button>
    </header>
    {feedback&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">{feedback}</p>}
    {loading?<p className="mt-4 text-sm text-muted">Cargando asignaciones del evento…</p>:composer&&<>
      <div className="mt-4 grid gap-2">
        {composer.members.map(member=><div key={member.assignmentId} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(120px,.7fr)_minmax(130px,.8fr)_auto] sm:items-center">
          <div><p className="font-medium">{member.name}</p><p className="text-xs text-muted">{member.roleLabel} · {member.rut||"RUT pendiente"}</p></div>
          <label className="grid gap-1 text-xs text-muted">Bloque<input aria-label={"Bloque de "+member.name} className="min-h-10 rounded-lg border bg-background px-3 text-sm text-foreground" placeholder="AM, PM, Montaje…" value={blocks[member.assignmentId]??""} onChange={event=>setBlocks(current=>({...current,[member.assignmentId]:event.target.value}))}/></label>
          <p className="text-xs text-muted">Estado: {member.status}</p>
          <Button size="sm" variant="outline" disabled={pending||!blocks[member.assignmentId]?.trim()||blocks[member.assignmentId]===member.block} onClick={()=>saveBlock(member.assignmentId)}><Save className="size-4"/>Guardar</Button>
        </div>)}
        {!composer.members.length&&<p className="rounded-xl border p-4 text-sm text-muted">Aún no hay staff asignado al evento.</p>}
      </div>
      {!!composer.missing.length&&<div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Completa esto antes de generar o enviar:</strong><ul className="mt-2 list-disc pl-5">{composer.missing.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending||!composer.canGenerate||hasUnsavedBlocks} onClick={download}><FileDown className="size-4"/>Descargar PDF oficial</Button>
        <Button variant="outline" disabled={pending||!composer.canGenerate||hasUnsavedBlocks} onClick={openMail}><Mail className="size-4"/>Enviar por correo</Button>
      </div>
    </>}
    {mailOpen&&composer&&<div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-3" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&sendState!=="sending")setMailOpen(false);}}>
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="roster-mail-title">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">BOOMBOX · CORREO PREMIUM</p><h3 id="roster-mail-title" className="mt-2 text-xl font-semibold">Enviar nómina oficial</h3>
        <label className="mt-4 grid gap-1 text-sm font-medium">Correo del cliente<input type="email" className="min-h-11 rounded-lg border bg-background px-3" value={to} onChange={event=>setTo(event.target.value)} placeholder="cliente@empresa.cl"/></label>
        <div className="mt-3 rounded-xl border bg-muted/10 p-4 text-sm">
          <p><strong>Asunto:</strong> Nómina oficial BOOMBOX · {composer.eventName}</p>
          <p className="mt-2"><strong>Mensaje:</strong> Hola {composer.customerName||"equipo"}, adjuntamos la nómina oficial del equipo BOOMBOX para {composer.eventName}, el {composer.eventDate}. El PDF presenta al equipo organizado por bloque y función.</p>
          <p className="mt-2"><strong>Responsable / Back up:</strong> Matías Maira · RUT 16.357.402-0 · +56 9 7306 9315</p>
          <p className="mt-3 text-xs text-muted">Adjunto: nómina oficial en PDF ({composer.members.length} integrantes). El envío quedará registrado en el historial del evento.</p>
        </div>
        {sendState==="sent"&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</p>}
        {sendState==="error"&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{feedback}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={sendState==="sending"} onClick={()=>setMailOpen(false)}>Cerrar</Button><Button disabled={pending||sendState==="sending"||sendState==="sent"||!to.trim()} onClick={send}><Send className="size-4"/>{sendState==="sending"?"Enviando…":sendState==="sent"?"Enviado":"Enviar correo"}</Button></div>
      </section>
    </div>}
  </section>;
}
