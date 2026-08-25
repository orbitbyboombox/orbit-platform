"use client";

import { useState } from "react";
import { CheckCircle2, Download, Eye, FileImage } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;

export function CustomerPhotoStripDesignExperience({ data, token }: { data: PortalData; token: string }) {
  const current = data.documents.find((document) => document.document_type === "PHOTO_STRIP_DESIGN" && document.is_current);
  const [preview, setPreview] = useState(false);
  const approved = current?.workflow_status === "APPROVED";
  const url = current ? `/api/portal/${encodeURIComponent(token)}/design/${current.id}` : "";
  return <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" data-customer-photo-strip-design id="photo-strip-design">
    <header className="border-b border-border/70 p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Diseño de tira</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">DISEÑO DE TU TIRA DE FOTOS</h2><p className="mt-2 text-sm text-muted">Aquí encontrarás la versión vigente preparada para tu Evento.</p></div><StatusBadge label={current ? approved ? "APROBADO" : "RECIBIDO" : "PENDIENTE"} variant={approved ? "success" : "warning"}/></div></header>
    <div className="p-5 sm:p-7">{current ? <div className="space-y-4"><div className="overflow-hidden rounded-2xl border bg-background">{preview ? <iframe className="h-[28rem] w-full bg-white sm:h-[38rem]" src={url} title="Diseño de tu tira de fotos"/> : <div className="flex min-h-56 flex-col items-center justify-center p-7 text-center"><FileImage className="size-9 text-brand"/><p className="mt-4 max-w-full break-all font-semibold">{current.original_filename || "Diseño de tira de fotos"}</p><p className="mt-2 text-sm text-muted">Versión actual V{current.version ?? 1}</p>{approved?<p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-4 py-3 font-semibold text-success"><CheckCircle2 className="size-5"/>Diseño aprobado</p>:null}</div>}</div><div className="grid grid-cols-2 gap-2 sm:flex"><ActionButton icon={Eye} label={preview?"Ocultar":"Ver diseño"} onClick={()=>setPreview(value=>!value)} variant="outline"/><ActionButton icon={Download} label="Descargar" onClick={()=>window.open(`${url}?download=1`,"_blank","noopener,noreferrer")}/></div></div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed p-7 text-center"><FileImage className="size-9 text-brand"/><p className="mt-4 font-semibold">DISEÑO DE TIRA · PENDIENTE</p><p className="mt-2 max-w-md text-sm leading-6 text-muted">BOOMBOX publicará aquí el diseño cuando esté disponible. No necesitas buscarlo en correos o mensajes.</p></div>}</div>
  </section>;
}
