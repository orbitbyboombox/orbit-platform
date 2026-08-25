"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, Eye, FileImage, HardDrive, History, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { approvePhotoStripDesignAction, retryPhotoStripDriveAction, uploadPhotoStripDesignAction } from "./actions";

export type PhotoStripDesignDocument = {
  id: string;
  version: number;
  isCurrent: boolean;
  status: "RECEIVED" | "APPROVED";
  originalFilename: string;
  createdAt: string;
  uploadedBy: string;
  approvedAt?: string;
  driveStatus: "PENDING" | "SYNCED" | "ERROR";
  driveError?: string;
  href: string;
};

const dateTime = (value: string) => new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago",
}).format(new Date(value));

export function PhotoStripDesignCenter({ projectId, documents }: { projectId: string; documents: readonly PhotoStripDesignDocument[] }) {
  const router = useRouter();
  const ordered = [...documents].sort((a, b) => b.version - a.version);
  const current = ordered.find((item) => item.isCurrent) ?? ordered[0];
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const status = current?.status ?? "PENDING";
  const statusLabel = status === "APPROVED" ? "APROBADO" : status === "RECEIVED" ? "RECIBIDO" : "PENDIENTE";
  const statusVariant = status === "APPROVED" ? "success" as const : "warning" as const;
  const submit = (formData: FormData) => startTransition(async () => {
    setMessage("Guardando el archivo protegido…");
    const result = await uploadPhotoStripDesignAction(formData);
    if (!result.ok) return setMessage(result.error);
    setUploadOpen(false);
    setMessage(result.duplicate ? `La versión V${result.version} ya estaba registrada.` : result.warning ?? `Versión V${result.version} recibida y archivada en Drive.`);
    router.refresh();
  });
  const approve = () => {
    if (!current || !window.confirm(`¿Marcar la versión V${current.version} como APROBADA?`)) return;
    startTransition(async () => {
      setMessage("Aprobando versión actual…");
      const result = await approvePhotoStripDesignAction(projectId, current.id);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };
  const retryDrive = () => current && startTransition(async () => {
    setMessage("Reintentando archivo administrativo…");
    const result = await retryPhotoStripDriveAction(projectId, current.id);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  });

  return <section className="rounded-2xl border border-brand/25 bg-brand/5 p-4 sm:p-5" data-photo-strip-design-center>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Archivo operacional</p><h3 className="mt-1 text-lg font-semibold">DISEÑO TIRA DE FOTOS</h3><p className="mt-1 text-sm text-muted">Versión canónica del arte que verá el cliente en su Portal.</p></div>
      <StatusBadge label={statusLabel} variant={statusVariant}/>
    </div>
    {current ? <div className="mt-5 grid min-w-0 gap-4 rounded-2xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3"><FileImage className="mt-0.5 size-5 shrink-0 text-brand"/><dl className="min-w-0 space-y-1 text-sm"><div><dt className="inline text-muted">Archivo: </dt><dd className="inline break-all font-semibold">{current.originalFilename}</dd></div><div><dt className="inline text-muted">Versión: </dt><dd className="inline font-semibold">V{current.version} · CURRENT</dd></div><div><dt className="inline text-muted">Subido: </dt><dd className="inline">{dateTime(current.createdAt)} · {current.uploadedBy}</dd></div>{current.approvedAt?<div><dt className="inline text-muted">Aprobado: </dt><dd className="inline">{dateTime(current.approvedAt)}</dd></div>:null}<div><dt className="inline text-muted">Drive: </dt><dd className="inline"><StatusBadge label={current.driveStatus === "SYNCED" ? "ARCHIVADO" : current.driveStatus === "ERROR" ? "ERROR" : "PENDIENTE"} variant={current.driveStatus === "SYNCED" ? "success" : current.driveStatus === "ERROR" ? "danger" : "warning"}/></dd></div></dl></div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-md lg:justify-end"><Button asChild variant="outline"><a href={current.href} rel="noreferrer" target="_blank"><Eye className="size-4"/>Ver diseño</a></Button><Button asChild variant="outline"><a href={`${current.href}?download=1`}><Download className="size-4"/>Descargar</a></Button>{status !== "APPROVED"?<Button disabled={pending} onClick={approve}><CheckCircle2 className="size-4"/>Aprobar</Button>:null}<Button disabled={pending} onClick={()=>setUploadOpen(true)} variant="outline"><Upload className="size-4"/>Nueva versión</Button></div>
    </div> : <div className="mt-5 rounded-2xl border border-dashed bg-card p-6 text-center"><FileImage className="mx-auto size-8 text-brand"/><p className="mt-3 font-semibold">Diseño pendiente</p><p className="mt-1 text-sm text-muted">Aún no existe un archivo asociado a este Evento.</p><Button className="mt-4" onClick={()=>setUploadOpen(true)}><Upload className="size-4"/>Subir diseño</Button></div>}
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button disabled={!ordered.length} onClick={()=>setHistoryOpen(true)} variant="outline"><History className="size-4"/>Ver historial ({ordered.length})</Button>{current && current.driveStatus !== "SYNCED"?<Button disabled={pending} onClick={retryDrive} variant="outline"><RefreshCw className="size-4"/>Reintentar Drive</Button>:null}</div>
    {current?.driveStatus === "ERROR"?<p className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">El diseño sigue protegido y visible en el Portal. Drive: {current.driveError || "pendiente de reintento"}.</p>:null}
    {message?<p aria-live="polite" className="mt-3 text-sm font-medium">{message}</p>:null}
    {uploadOpen?<MobileDialog description="PDF, JPG, JPEG o PNG de hasta 20 MB. La versión anterior se conservará en el historial." dismissOnOverlayClick={!pending} onClose={()=>{if(!pending)setUploadOpen(false)}} title={current?"Subir nueva versión":"Subir diseño de tira de fotos"} variant="fullscreen-mobile"><form action={submit} className="grid min-w-0 gap-5"><input name="projectId" type="hidden" value={projectId}/><label className="grid min-w-0 gap-2 text-sm font-medium">Archivo<input accept="application/pdf,image/jpeg,image/png,.jpg,.jpeg,.png,.pdf" className="min-h-12 min-w-0 max-w-full rounded-xl border bg-background p-2" name="file" required type="file"/></label><div className="rounded-xl border bg-background/50 p-4 text-sm text-muted">Al guardar, el archivo quedará protegido en ORBIT, será la versión actual del Portal y se archivará de forma idempotente en <strong>04_Diseños</strong>.</div><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button disabled={pending} onClick={()=>setUploadOpen(false)} type="button" variant="outline">Cancelar</Button><Button disabled={pending} type="submit"><HardDrive className="size-4"/>{pending?"Guardando…":"Guardar diseño"}</Button></div></form></MobileDialog>:null}
    {historyOpen?<MobileDialog description="Solo Founder y Administración pueden inspeccionar las versiones anteriores." onClose={()=>setHistoryOpen(false)} title="Historial del diseño" variant="fullscreen-mobile"><ol className="space-y-3">{ordered.map(item=><li className="grid min-w-0 gap-3 rounded-2xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={item.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>V{item.version}</strong>{item.isCurrent?<StatusBadge label="CURRENT" variant="info"/>:<StatusBadge label="SUPERSEDIDA" variant="neutral"/>}<StatusBadge label={item.status === "APPROVED"?"APROBADO":"RECIBIDO"} variant={item.status === "APPROVED"?"success":"warning"}/></div><p className="mt-2 break-all text-sm font-medium">{item.originalFilename}</p><p className="mt-1 text-xs text-muted">{dateTime(item.createdAt)} · {item.uploadedBy}</p></div><div className="flex gap-2"><Button asChild size="sm" variant="outline"><a href={item.href} rel="noreferrer" target="_blank"><Eye className="size-4"/>Ver</a></Button><Button asChild size="sm" variant="outline"><a href={`${item.href}?download=1`}><Download className="size-4"/>Descargar</a></Button></div></li>)}</ol></MobileDialog>:null}
  </section>;
}
