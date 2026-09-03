"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, FileSignature, History, LoaderCircle, Mail, Send } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReservationConfirmationComposer } from "@/features/connectors/google-gmail/application/reservation-confirmation.service";
import { renderReservationConfirmationDelivery } from "@/features/connectors/google-gmail/application/reservation-confirmation.html";
import { getManualConfirmationPreviewAction, sendManualReservationConfirmationAction } from "../actions/customer.actions";
import { createSigningInvitationAction } from "./signing.actions";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const chileDateTime = (value: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
const stateLabel = (status: ReservationConfirmationComposer["status"]) => status === "SENT" ? "ENVIADA" : status === "FAILED" ? "FALLIDA" : "NUNCA ENVIADA";
const historyStatus = (status: string) => status === "SENT" ? "ENVIADA" : status === "FAILED" ? "FALLIDA" : "PENDIENTE";

type SendState =
  | { status: "idle" }
  | { status: "sending"; message: string }
  | { status: "success"; message: string; cc: string[] }
  | { status: "error"; message: string };

export function AgreementSigningControl({ agreementId, projectId, status }: { agreementId?: string; projectId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sending, startSending] = useTransition();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [composer, setComposer] = useState<ReservationConfirmationComposer | null>(null);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [requestId, setRequestId] = useState("");
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });
  const signed = status === "SIGNED";

  const refreshCommunication = (openComposer = false) => startSending(async () => {
    const result = await getManualConfirmationPreviewAction(projectId);
    if (!result.ok) { setMessage(result.message); return; }
    setComposer(result.preview);
    if (openComposer) {
      setSubject(result.preview.subject);
      setBody(result.preview.body);
      setTo(result.preview.to);
      setCc(result.preview.cc.join("\n"));
      setRequestId(crypto.randomUUID());
      setSendState({ status: "idle" });
      setConfirmingResend(false);
      setOpen(true);
    }
  });

  useEffect(() => {
    void refreshCommunication();
    // The Event identity is the only dependency; refreshes are explicit after sends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const create = () => agreementId && startTransition(async () => {
    const result = await createSigningInvitationAction(agreementId, projectId);
    if (!result.ok) { setMessage(result.error); return; }
    setUrl(result.url);
    setMessage("Borrador Gmail preparado. Revisa antes de enviarlo.");
  });

  const deliver = (confirmResend: boolean) => {
    if (!composer || sending || sendState.status === "success") return;
    setConfirmingResend(false);
    setSendState({ status: "sending", message: `Enviando... a ${to}` });
    startSending(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("requestId", requestId || crypto.randomUUID());
      formData.set("subject", subject);
      formData.set("body", body);
      formData.set("to", to);
      formData.set("cc", cc);
      formData.set("confirmResend", String(confirmResend));
      const result = await sendManualReservationConfirmationAction(formData);
      if (!result.ok) {
        setRequestId(crypto.randomUUID());
        setSendState({ status: "error", message: `No se pudo enviar la confirmación.${result.error ? ` ${result.error}` : ""}` });
        void refreshCommunication();
        return;
      }
      setSendState({ status: "success", message: `✓ Confirmación enviada a ${result.recipient}`, cc: result.ccRecipients });
      router.refresh();
      void refreshCommunication();
    });
  };

  const requestDelivery = () => {
    if (composer?.hasSuccessfulSend) { setConfirmingResend(true); return; }
    deliver(false);
  };
  const statusVariant = composer?.status === "SENT" ? "success" : composer?.status === "FAILED" ? "danger" : "warning";
  const actionLabel = composer?.hasSuccessfulSend ? "REENVIAR CONFIRMACIÓN" : "ENVIAR CONFIRMACIÓN";
  const previewHtml = composer
    ? renderReservationConfirmationDelivery({
        body,
        website: composer.website,
        companyCommercial: composer.companyCommercial,
        portalCtaAvailable: composer.portalCtaAvailable,
        portalUrl: composer.portalUrl,
      }).htmlBody
    : "";

  return <div className="space-y-5">
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileSignature className="size-5 text-brand"/><div><h2 className="font-semibold">Documento oficial</h2><p className="mt-1 text-sm text-muted">Portal y documentos se sincronizan sin enviar correos al cliente.</p></div></div><StatusBadge label={signed ? "Firmado y bloqueado" : agreementId ? "Documento disponible" : "Acuerdo pendiente"} variant={signed ? "success" : agreementId ? "info" : "warning"}/></div>
      {!signed && agreementId ? <ActionButton className="mt-5" disabled={pending} label={pending ? "Preparando…" : "Preparar enlace de firma"} onClick={create}/> : null}
      {url ? <div className="mt-5 rounded-xl border bg-background/40 p-4"><p className="break-all text-sm">{url}</p><ActionButton className="mt-3" icon={Copy} label="Copiar enlace" onClick={() => void navigator.clipboard.writeText(url)} variant="outline"/></div> : null}
    </section>

    <section className="rounded-2xl border bg-card p-5 sm:p-6" data-customer-communications>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><Mail className="mt-0.5 size-5 text-brand"/><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">COMUNICACIONES CON EL CLIENTE</p><h2 className="mt-1 font-semibold">Confirmación de reserva</h2><p className="mt-1 text-sm text-muted">Estado independiente de la reserva y de las notificaciones internas del Founder.</p></div></div>{composer ? <StatusBadge label={stateLabel(composer.status)} variant={statusVariant}/> : <StatusBadge label={sending ? "CARGANDO…" : "NO DISPONIBLE"} variant="warning"/>}</div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3"><Detail label="Destinatario" value={composer?.to ?? "Cargando…"}/><Detail label="CC" value={composer?.cc.length ? composer.cc.join(", ") : "Sin CC"}/><Detail label="Último envío" value={composer?.lastAttemptAt ? chileDateTime(composer.lastAttemptAt) : "Nunca"}/>{composer?.companyCommercial ? <Detail label="Documento formal" value={composer.attachmentFilename ?? "No disponible"}/> : null}{composer?.companyCommercial ? <Detail label="Acceso cliente" value={composer.portalCtaAvailable ? "Portal ORBIT seguro" : "CTA omitido: acceso no disponible"}/> : null}</dl>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row"><Button disabled={!composer || sending} onClick={() => refreshCommunication(true)}>{sending ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}{actionLabel}</Button><Button disabled={!composer} onClick={() => setHistoryOpen((value) => !value)} variant="outline"><History className="size-4"/>VER HISTORIAL</Button></div>
      {historyOpen && composer ? <div className="mt-5 divide-y rounded-xl border" data-reservation-confirmation-history>{composer.history.length ? composer.history.map((item) => <article className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto]" key={item.id}><div className="min-w-0"><p className="font-medium">{chileDateTime(item.sentAt)} · Confirmación de reserva{item.isResend ? " · Reenvío" : ""}</p><p className="mt-1 break-all text-muted">{item.to}{item.cc.length ? ` · CC: ${item.cc.join(", ")}` : ""}</p>{item.commercialDocumentReference ? <p className="mt-1 text-xs text-muted">Adjunto: {item.commercialDocumentReference}</p> : null}{item.portalDestinationType ? <p className="mt-1 text-xs text-muted">Destino: Portal ORBIT seguro</p> : null}{item.failureReason ? <p className="mt-1 text-xs text-danger">{item.failureReason}</p> : null}</div><strong>{historyStatus(item.status)}</strong></article>) : <p className="p-4 text-sm text-muted">NUNCA ENVIADA. No existen intentos registrados.</p>}</div> : null}
      {message ? <p className="mt-4 text-sm font-medium">{message}</p> : null}
    </section>

    {open && composer ? <MobileDialog description="Revisa exactamente quién recibirá la confirmación y su contenido antes de enviar." dismissOnOverlayClick={false} eyebrow="COMUNICACIONES CON EL CLIENTE" onClose={() => { if (!sending) setOpen(false); }} size="xl" title={actionLabel} variant="fullscreen-mobile">
      <div className="space-y-5">
        {sendState.status !== "idle" ? <div aria-live="polite" className={`rounded-2xl border p-4 text-sm ${sendState.status === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : sendState.status === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-brand/30 bg-brand/5"}`}><div className="flex gap-2">{sendState.status === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0"/> : sendState.status === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0"/> : <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin"/>}<div><p className="font-medium">{sendState.message}</p>{sendState.status === "success" && sendState.cc.length ? <p className="mt-1 text-xs">CC: {sendState.cc.join(", ")}</p> : null}</div></div></div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Detail label="PARA" value={to}/><Detail label="Servicio" value={composer.services}/><Detail label="Duración" value={composer.duration}/><Detail label="Fecha / horario" value={`${composer.eventDate} · ${composer.eventTime}`}/><Detail label="Valor total" value={money(composer.total)}/><Detail label="Abono recibido" value={money(composer.paid)}/><Detail label="Saldo pendiente" value={money(composer.balance)}/><Detail label="Lugar" value={composer.venue}/></div>
        {composer.companyCommercial ? <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm"><p className="font-semibold">Documento comercial adjunto</p><p className="mt-1 break-words text-muted">{composer.attachmentFilename ?? "No existe una cotización formal disponible."}</p><p className="mt-2 text-xs text-muted">{composer.portalCtaAvailable ? "El botón ABRIR EVENTO EN ORBIT dirige al acceso seguro del Portal, sin incluir credenciales ni rutas internas." : "El email omitirá el botón porque el acceso seguro al Portal todavía no está disponible."}</p></div> : null}
        <label className="block text-sm font-medium">PARA<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-sm" disabled={sending || sendState.status === "success"} onChange={(event) => setTo(event.target.value)} placeholder="cliente@empresa.cl" required type="email" value={to}/><span className="mt-2 block text-xs font-normal text-muted">Se propone el email principal actual del cliente. El cambio aplica sólo a este envío y no modifica el CRM.</span></label>
        <label className="block text-sm font-medium">CC<textarea className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" disabled={sending || sendState.status === "success"} onChange={(event) => setCc(event.target.value)} placeholder="Un correo por línea o separados por coma" value={cc}/><span className="mt-2 block text-xs font-normal text-muted">Se propone el email secundario certificado. Puedes quitarlo o cambiarlo sólo para este envío.</span></label>
        <label className="block text-sm font-medium">ASUNTO<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-sm" disabled={sending || sendState.status === "success"} onChange={(event) => setSubject(event.target.value)} value={subject}/></label>
        <label className="block text-sm font-medium">MENSAJE<textarea className="mt-2 min-h-80 w-full rounded-xl border bg-background p-3 text-sm" disabled={sending || sendState.status === "success"} onChange={(event) => setBody(event.target.value)} value={body}/></label>
        <section aria-label="Vista previa real del email" className="space-y-2">
          <p className="text-sm font-medium">VISTA PREVIA DEL EMAIL</p>
          <p className="text-xs text-muted">Esta es la misma salida HTML que se entrega al proveedor.</p>
          <iframe
            className="h-[680px] w-full rounded-2xl border bg-white"
            sandbox=""
            srcDoc={previewHtml}
            title="Vista previa de confirmación de reserva"
          />
        </section>
        {confirmingResend ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><p className="font-semibold">¿Enviar nuevamente la confirmación a {to}?</p><p className="mt-1 text-sm">Una confirmación explícita genera como máximo un email.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button disabled={sending} onClick={() => deliver(true)} type="button">Sí, enviar nuevamente</Button><Button disabled={sending} onClick={() => setConfirmingResend(false)} type="button" variant="outline">Volver</Button></div></div> : null}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted">{sendState.status === "success" ? sendState.message : to.trim() ? `Se enviará a ${to}${cc.trim() ? ` · CC: ${cc.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).join(", ")}` : ""}.` : "No existe un email válido del cliente para enviar la confirmación. Ingresa o selecciona un destinatario."}</p><div className="flex gap-2"><Button disabled={sending} onClick={() => setOpen(false)} type="button" variant="outline">Cerrar</Button><Button disabled={sending || sendState.status === "success" || confirmingResend || !to.trim() || !subject.trim() || !body.trim()} onClick={requestDelivery} type="button">{sending ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}{sending ? "Enviando..." : sendState.status === "error" ? "Reintentar" : actionLabel}</Button></div></div>
      </div>
    </MobileDialog> : null}
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border bg-background/40 p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || "—"}</dd></div>;
}
