"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Eye, History, Save, Send, Video } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getBbox360VideoDeliveryPreviewAction, saveBbox360VideoDeliveryPreviewAction, sendBbox360VideoDeliveryAction } from "./bbox360-video-delivery.actions";
import { renderBbox360VideoDeliveryPreviewHtml } from "@/features/connectors/google-gmail/application/bbox360-video-delivery.template";
import type { Bbox360VideoDeliveryComposer } from "@/features/connectors/google-gmail/application/bbox360-video-delivery.service";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function Bbox360VideoDeliveryControl({ projectId }: { projectId: string }) {
  const [composer, setComposer] = useState<Bbox360VideoDeliveryComposer | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => { let cancelled = false; void getBbox360VideoDeliveryPreviewAction(projectId).then((result) => { if (cancelled) return; if (result.ok) { setComposer(result.preview); if (result.preview.eligible) { setVideoUrl(result.preview.currentVideoUrl); setCc(result.preview.cc.join(", ")); } } else setMessage(result.error); }); return () => { cancelled = true; }; }, [projectId]);

  if (!composer || !composer.eligible) return null;
  const save = () => startTransition(async () => { const data = new FormData(); data.set("projectId", projectId); data.set("videoUrl", videoUrl); const result = await saveBbox360VideoDeliveryPreviewAction(data); setMessage(result.ok ? "✓ Enlace guardado" : result.error); if (result.ok) setComposer(result.preview); });
  const send = (confirmResend = false) => startTransition(async () => { if (composer.hasSuccessfulSend && !confirmResend && !window.confirm(`¿Enviar nuevamente los videos BBOX 360 a ${composer.to}?`)) return; const data = new FormData(); data.set("projectId", projectId); data.set("requestId", uid()); data.set("videoUrl", videoUrl); data.set("cc", cc); data.set("confirmResend", String(confirmResend)); const result = await sendBbox360VideoDeliveryAction(data); setMessage(result.ok ? result.message : result.error); if (result.ok) { const refreshed = await getBbox360VideoDeliveryPreviewAction(projectId); if (refreshed.ok) setComposer(refreshed.preview); } });

  return <section id="bbox360-video-delivery" className="mt-6 rounded-2xl border bg-background p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Videos BBOX 360</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold"><Video className="size-5 text-brand" />Entrega de videos</h2><p className="mt-1 text-sm text-muted">Enlace independiente para el cliente. No se envía automáticamente.</p></div>
      <StatusBadge label={composer.status === "SENT" ? "ENVIADO" : composer.status === "FAILED" ? "ERROR" : "PENDIENTE"} variant={composer.status === "SENT" ? "success" : composer.status === "FAILED" ? "danger" : "warning"} />
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
      <div className="space-y-3"><label className="block text-sm font-medium">Enlace HTTPS de videos BBOX 360<input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="https://..." type="url" /></label><label className="block text-sm font-medium">CC opcional<input value={cc} onChange={(event) => setCc(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="correo@ejemplo.cl" /></label><div className="flex flex-wrap gap-2"><ActionButton icon={Save} label="Guardar enlace" onClick={save} disabled={pending || !videoUrl.trim()} /><ActionButton icon={Eye} label="Vista previa" onClick={() => setPreviewOpen(true)} variant="outline" disabled={!videoUrl.trim()} /><ActionButton icon={Send} label={composer.hasSuccessfulSend ? "Reenviar videos" : "Enviar videos"} onClick={() => send(false)} variant="outline" disabled={pending || !videoUrl.trim()} /></div>{message && <p aria-live="polite" className="text-sm text-muted">{message}</p>}</div>
      <div className="rounded-xl border bg-muted/20 p-4 text-sm"><p className="font-semibold">Destinatario</p><p className="mt-2 break-all">{composer.to}</p>{composer.lastSentAt && <p className="mt-2 text-xs text-muted">Último envío: {new Date(composer.lastSentAt).toLocaleString("es-CL")}</p>}<p className="mt-3 text-xs leading-5 text-muted">El envío requiere confirmación explícita y queda registrado de forma independiente de Fotos digitales.</p></div>
    </div>
    {composer.history.length > 0 && <div className="mt-5 border-t pt-4"><p className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" />Historial de videos BBOX 360</p><div className="mt-3 space-y-2">{composer.history.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm" key={item.id}><span>{new Date(item.sentAt).toLocaleString("es-CL")}</span><span className="flex items-center gap-2">{item.status === "SENT" ? <CheckCircle2 className="size-4 text-success" /> : null}{item.status}</span><span className="break-all text-xs text-muted">{item.to}</span></div>)}</div></div>}
    {previewOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-background"><div className="flex items-center justify-between border-b p-4"><p className="font-semibold">Vista previa · Videos BBOX 360</p><button className="rounded-lg border px-3 py-1 text-sm" onClick={() => setPreviewOpen(false)}>Cerrar</button></div><iframe title="Vista previa del correo de videos BBOX 360" className="min-h-0 flex-1 bg-white" srcDoc={renderBbox360VideoDeliveryPreviewHtml(composer.customerName, composer.eventDate, videoUrl)} /></div></div>}
  </section>;
}
