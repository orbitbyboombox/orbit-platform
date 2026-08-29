"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ExternalLink,
  History,
  LoaderCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { renderDigitalPhotoDeliveryPreviewHtml } from "@/features/connectors/google-gmail/application/digital-photo-delivery.template";
import type { DigitalPhotoDeliveryComposer } from "@/features/connectors/google-gmail/application/digital-photo-delivery.service";
import {
  getDigitalPhotoDeliveryPreviewAction,
  saveDigitalPhotoDeliveryPreviewAction,
  sendDigitalPhotoDeliveryAction,
} from "./digital-photo-delivery.actions";

type SendState =
  | { status: "idle" }
  | { status: "sending"; message: string }
  | { status: "success"; message: string; recipient: string; cc: string[] }
  | { status: "error"; message: string };

const chileDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));

const statusLabel = (status: DigitalPhotoDeliveryComposer["status"]) =>
  status === "SENT" ? "ENVIADAS" : status === "FAILED" ? "FALLIDA" : "PENDIENTE";

const historyLabel = (status: string) =>
  status === "SENT" ? "ENVIADAS" : status === "FAILED" ? "FALLIDA" : "PENDIENTE";

export function DigitalPhotoDeliveryControl({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submissionGate = useRef(false);
  const [composer, setComposer] = useState<DigitalPhotoDeliveryComposer | null>(null);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [cc, setCc] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });

  const refresh = () =>
    startTransition(async () => {
      const result = await getDigitalPhotoDeliveryPreviewAction(projectId);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setComposer(result.preview);
      setFeedback("");
    });

  useEffect(() => {
    refresh();
    // The Event identity is the only initial read dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const launch = () => {
    if (!composer) return;
    setPhotoUrl(composer.currentPhotoUrl);
    setPreviewUrl(composer.currentPhotoUrl);
    setPreviewHtml(
      renderDigitalPhotoDeliveryPreviewHtml(
        composer.customerName,
        composer.currentPhotoUrl,
      ),
    );
    setCc(composer.cc.join("\n"));
    setRequestId(crypto.randomUUID());
    setConfirmingResend(false);
    setSendState({ status: "idle" });
    submissionGate.current = false;
    setOpen(true);
  };

  const updatePhotoUrl = (value: string) => {
    setPhotoUrl(value);
    setPreviewHtml(
      renderDigitalPhotoDeliveryPreviewHtml(composer?.customerName ?? "Cliente", value),
    );
  };

  const preview = () => {
    if (pending || submissionGate.current) return;
    submissionGate.current = true;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("photoUrl", photoUrl);
      const result = await saveDigitalPhotoDeliveryPreviewAction(formData);
      submissionGate.current = false;
      if (!result.ok) {
        setSendState({ status: "error", message: result.error });
        return;
      }
      setComposer(result.preview);
      setPhotoUrl(result.preview.currentPhotoUrl);
      setPreviewUrl(result.preview.currentPhotoUrl);
      setPreviewHtml(result.preview.previewHtml);
      setSendState({ status: "idle" });
    });
  };

  const deliver = (confirmResend: boolean) => {
    if (
      !composer ||
      pending ||
      submissionGate.current ||
      !previewHtml ||
      previewUrl !== photoUrl.trim()
    )
      return;
    submissionGate.current = true;
    setConfirmingResend(false);
    setSendState({ status: "sending", message: "ENVIANDO..." });
    startTransition(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("requestId", requestId || crypto.randomUUID());
      formData.set("photoUrl", photoUrl);
      formData.set("cc", cc);
      formData.set("confirmResend", String(confirmResend));
      const result = await sendDigitalPhotoDeliveryAction(formData);
      submissionGate.current = false;
      if (!result.ok) {
        setRequestId(crypto.randomUUID());
        setSendState({
          status: "error",
          message: result.error,
        });
        refresh();
        return;
      }
      setSendState({
        status: "success",
        message: result.message,
        recipient: result.result.recipient,
        cc: result.result.ccRecipients,
      });
      router.refresh();
      refresh();
    });
  };

  const requestDelivery = () => {
    if (composer?.hasSuccessfulSend) {
      setConfirmingResend(true);
      return;
    }
    deliver(false);
  };

  const actionLabel = composer?.hasSuccessfulSend
    ? "REENVIAR FOTOS DIGITALES"
    : "ENVIAR FOTOS DIGITALES";
  const badgeVariant =
    composer?.status === "SENT"
      ? "success"
      : composer?.status === "FAILED"
        ? "danger"
        : "warning";

  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-6"
      data-digital-photo-delivery
      id="digital-photo-delivery"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <Camera className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              COMUNICACIONES CON EL CLIENTE
            </p>
            <h2 className="mt-1 font-semibold">Fotos digitales</h2>
            <p className="mt-1 text-sm text-muted">
              Entrega el enlace preparado para este Evento sin almacenar las fotos en ORBIT.
            </p>
          </div>
        </div>
        <StatusBadge
          label={composer ? statusLabel(composer.status) : pending ? "CARGANDO…" : "NO DISPONIBLE"}
          variant={badgeVariant}
        />
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Detail label="Destinatario" value={composer?.to ?? "Cargando…"} />
        <Detail
          label="CC"
          value={composer?.cc.length ? composer.cc.join(", ") : "Sin CC"}
        />
        <Detail
          label="Último envío"
          value={composer?.lastSentAt ? chileDateTime(composer.lastSentAt) : "Nunca"}
        />
      </dl>
      <div className="mt-3 rounded-xl border bg-background/40 p-3 text-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">FOTOS DIGITALES</p>
        {composer?.currentPhotoUrl ? (
          <a
            className="mt-1 inline-flex max-w-full items-center gap-2 break-all font-medium text-brand hover:underline"
            href={composer.currentPhotoUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>{composer.currentPhotoUrl}</span>
            <ExternalLink className="size-4 shrink-0" />
          </a>
        ) : (
          <p className="mt-1 text-muted">Pendiente de enlace</p>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button disabled={!composer || pending} onClick={launch} type="button">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {actionLabel}
        </Button>
        <Button
          disabled={!composer}
          onClick={() => setHistoryOpen((value) => !value)}
          type="button"
          variant="outline"
        >
          <History className="size-4" />VER HISTORIAL
        </Button>
      </div>
      {historyOpen && composer ? (
        <div className="mt-5 divide-y rounded-xl border" data-digital-photo-history>
          {composer.history.length ? (
            composer.history.map((item) => (
              <article className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto]" key={item.id}>
                <div className="min-w-0">
                  <p className="font-medium">
                    {chileDateTime(item.sentAt)} · Fotos digitales{item.isResend ? " · Reenvío" : ""}
                  </p>
                  <p className="mt-1 break-all text-muted">
                    Enviado a: {item.to}{item.cc.length ? ` · CC: ${item.cc.join(", ")}` : ""}
                  </p>
                  {item.photoUrl ? (
                    <a
                      className="mt-1 block break-all text-xs text-brand hover:underline"
                      href={item.photoUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Ver detalle
                    </a>
                  ) : null}
                  {item.failureReason ? (
                    <p className="mt-1 text-xs text-danger">{item.failureReason}</p>
                  ) : null}
                </div>
                <strong>{historyLabel(item.status)}</strong>
              </article>
            ))
          ) : (
            <p className="p-4 text-sm text-muted">PENDIENTE. No existen envíos registrados.</p>
          )}
        </div>
      ) : null}
      {feedback ? <p className="mt-4 text-sm text-danger">{feedback}</p> : null}

      {open && composer ? (
        <MobileDialog
          description="Pega el enlace, revisa destinatarios y confirma la vista previa antes de enviar."
          dismissOnOverlayClick={false}
          eyebrow="COMUNICACIONES CON EL CLIENTE"
          onClose={() => {
            if (!pending) setOpen(false);
          }}
          size="xl"
          title={actionLabel}
          variant="fullscreen-mobile"
        >
          <div className="min-w-0 space-y-5">
            {sendState.status !== "idle" ? (
              <div
                aria-live="polite"
                className={`rounded-2xl border p-4 text-sm ${
                  sendState.status === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : sendState.status === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-brand/30 bg-brand/5"
                }`}
              >
                <div className="flex gap-2">
                  {sendState.status === "success" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : sendState.status === "error" ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
                  )}
                  <div>
                    <p className="font-medium">{sendState.message}</p>
                    {sendState.status === "success" ? (
                      <p className="mt-1 text-xs">
                        Enviado a {sendState.recipient}
                        {sendState.cc.length ? ` · CC: ${sendState.cc.join(", ")}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <Detail label="CLIENTE" value={composer.customerName} />
              <Detail label="PARA" value={composer.to} />
              <Detail label="ÚLTIMO ENVÍO" value={composer.lastSentAt ? chileDateTime(composer.lastSentAt) : "Nunca"} />
            </div>
            <Detail label="ASUNTO" value={composer.subject} />
            <label className="block min-w-0 text-sm font-medium">
              CC
              <textarea
                className="mt-2 min-h-24 w-full min-w-0 rounded-xl border bg-background p-3 text-sm"
                disabled={pending || sendState.status === "success"}
                onChange={(event) => setCc(event.target.value)}
                placeholder="Un correo por línea o separados por coma"
                value={cc}
              />
              <span className="mt-2 block text-xs font-normal text-muted">
                Se propone el email secundario certificado. Puedes quitarlo o agregar un CC temporal.
              </span>
            </label>
            <label className="block min-w-0 text-sm font-medium">
              LINK FOTOS DIGITALES
              <input
                className="mt-2 min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm"
                disabled={pending || sendState.status === "success"}
                inputMode="url"
                onChange={(event) => updatePhotoUrl(event.target.value)}
                placeholder="https://drive.google.com/..."
                type="url"
                value={photoUrl}
              />
              <span className="mt-2 block text-xs font-normal text-muted">
                Este enlace será enviado al cliente para descargar las fotos digitales del evento.
              </span>
            </label>
            <div className="flex justify-end">
              <Button
                disabled={pending || !photoUrl.trim() || sendState.status === "success"}
                onClick={preview}
                type="button"
                variant="outline"
              >
                {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
                ACTUALIZAR VISTA PREVIA
              </Button>
            </div>
            {previewHtml ? (
              <section className="min-w-0 overflow-hidden rounded-2xl border bg-white">
                <p className="border-b bg-background/60 px-4 py-3 text-xs font-semibold uppercase tracking-[.14em] text-brand">
                  VISTA PREVIA DEL CORREO
                </p>
                <iframe
                  className="h-[42rem] w-full bg-white sm:h-[52rem]"
                  sandbox=""
                  srcDoc={previewHtml}
                  title="Vista previa del email de fotos digitales"
                />
              </section>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted">
                Ingresa un enlace HTTPS válido y actualiza la vista previa.
              </p>
            )}
            {confirmingResend ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">¿Enviar nuevamente las fotos digitales a {composer.to}?</p>
                <p className="mt-1 text-sm">Una confirmación explícita genera como máximo un email.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button disabled={pending} onClick={() => deliver(true)} type="button">
                    Sí, enviar nuevamente
                  </Button>
                  <Button disabled={pending} onClick={() => setConfirmingResend(false)} type="button" variant="outline">
                    Volver
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="break-words text-xs text-muted">
                {sendState.status === "success"
                  ? sendState.message
                  : `Se enviará a ${composer.to}${cc.trim() ? ` · CC: ${cc.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).join(", ")}` : ""}.`}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
                  Cerrar
                </Button>
                <Button
                  disabled={
                    pending ||
                    sendState.status === "success" ||
                    confirmingResend ||
                    !previewHtml ||
                    !photoUrl.trim() ||
                    previewUrl !== photoUrl.trim()
                  }
                  onClick={requestDelivery}
                  type="button"
                >
                  {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {pending ? "ENVIANDO..." : actionLabel}
                </Button>
              </div>
            </div>
          </div>
        </MobileDialog>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
