"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  History,
  LoaderCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatPreEventCurrency,
  formatPreEventDate,
  renderPreEventReminderHtml,
} from "@/features/connectors/google-gmail/application/pre-event-reminder.template";
import type { PreEventReminderComposer } from "@/features/connectors/google-gmail/application/pre-event-reminder.service";
import {
  getPreEventReminderPreviewAction,
  sendPreEventReminderAction,
} from "./pre-event-reminder.actions";

type SendState =
  | { status: "idle" }
  | { status: "sending"; message: string }
  | { status: "success"; message: string; cc: string[] }
  | { status: "error"; message: string };

const chileDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));

const stateLabel = (status: PreEventReminderComposer["status"]) =>
  status === "SENT"
    ? "ENVIADO"
    : status === "FAILED"
      ? "FALLIDO"
      : status === "PENDING"
        ? "PROCESANDO"
        : "NUNCA ENVIADO";

const historyStatus = (status: string) =>
  status === "SENT"
    ? "ENVIADO"
    : status === "FAILED"
      ? "FALLIDO"
      : "PENDIENTE";

const timingLabel = (days: number) =>
  days === 0
    ? "Evento hoy"
    : days === 1
      ? "Evento mañana"
      : days > 1
        ? `Evento en ${days} días`
        : `Evento hace ${Math.abs(days)} días`;

export function PreEventReminderControl({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submissionGate = useRef(false);
  const [composer, setComposer] = useState<PreEventReminderComposer | null>(null);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [requestId, setRequestId] = useState("");
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });

  const refresh = (openComposer = false) =>
    startTransition(async () => {
      const result = await getPreEventReminderPreviewAction(projectId);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setComposer(result.preview);
      setFeedback("");
      if (openComposer) {
        setTo(result.preview.to);
        setCc(result.preview.cc.join("\n"));
        setSubject(result.preview.subject);
        setRequestId(crypto.randomUUID());
        setConfirmingResend(false);
        setSendState({ status: "idle" });
        submissionGate.current = false;
        setOpen(true);
      }
    });

  useEffect(() => {
    refresh();
    // The Event identity is the only initial read dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const deliver = (confirmResend: boolean) => {
    if (!composer || pending || submissionGate.current || sendState.status === "success") {
      return;
    }
    submissionGate.current = true;
    setConfirmingResend(false);
    setSendState({ status: "sending", message: `Enviando a ${to}…` });
    startTransition(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("requestId", requestId || crypto.randomUUID());
      formData.set("expectedFingerprint", composer.fingerprint);
      formData.set("to", to);
      formData.set("cc", cc);
      formData.set("subject", subject);
      formData.set("confirmResend", String(confirmResend));
      const result = await sendPreEventReminderAction(formData);
      submissionGate.current = false;
      if (!result.ok) {
        setSendState({ status: "error", message: result.error });
        return;
      }
      setSendState({
        status: "success",
        message: result.message,
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
    ? "REENVIAR RECORDATORIO PRE-EVENTO"
    : "RECORDATORIO PRE-EVENTO";
  const statusVariant =
    composer?.status === "SENT"
      ? "success"
      : composer?.status === "FAILED"
        ? "danger"
        : "warning";
  const previewHtml = composer
    ? renderPreEventReminderHtml(composer.model, subject)
    : "";

  return (
    <section
      className="scroll-mt-24 rounded-2xl border bg-card p-5 sm:p-6"
      data-pre-event-reminder
      id="pre-event-reminder"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              COMUNICACIONES CON EL CLIENTE
            </p>
            <h2 className="mt-1 font-semibold">Todo listo para tu evento</h2>
            <p className="mt-1 text-sm text-muted">
              Confirmación operacional manual con instrucciones finales y saldo sólo cuando corresponda.
            </p>
          </div>
        </div>
        <StatusBadge
          label={composer ? stateLabel(composer.status) : pending ? "CARGANDO…" : "NO DISPONIBLE"}
          variant={statusVariant}
        />
      </div>
      {composer ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Momento" value={timingLabel(composer.daysUntilEvent)} />
          <Detail label="Destinatario" value={composer.to || "Por ingresar"} />
          <Detail
            label="Saldo en email"
            value={
              composer.model.payment
                ? formatPreEventCurrency(composer.model.payment.outstandingBalance)
                : "No corresponde"
            }
          />
          <Detail
            label="Último envío"
            value={composer.lastAttemptAt ? chileDateTime(composer.lastAttemptAt) : "Nunca"}
          />
        </dl>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button disabled={!composer || pending} onClick={() => refresh(true)} type="button">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {actionLabel}
        </Button>
        <Button
          disabled={!composer}
          onClick={() => setHistoryOpen((value) => !value)}
          type="button"
          variant="outline"
        >
          <History className="size-4" /> VER HISTORIAL
        </Button>
      </div>
      {feedback ? <p className="mt-4 text-sm text-danger">{feedback}</p> : null}
      {historyOpen && composer ? (
        <div className="mt-5 divide-y rounded-xl border" data-pre-event-reminder-history>
          {composer.history.length ? (
            composer.history.map((item) => (
              <article className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto]" key={item.id}>
                <div className="min-w-0">
                  <p className="font-medium">
                    {chileDateTime(item.sentAt)} · Recordatorio pre-evento
                    {item.isResend ? " · Reenvío" : ""}
                  </p>
                  <p className="mt-1 break-all text-muted">
                    Enviado a: {item.to}
                    {item.cc.length ? ` · CC: ${item.cc.join(", ")}` : ""}
                  </p>
                  {item.failureReason ? (
                    <p className="mt-1 text-xs text-danger">{item.failureReason}</p>
                  ) : null}
                </div>
                <strong>{historyStatus(item.status)}</strong>
              </article>
            ))
          ) : (
            <p className="p-4 text-sm text-muted">No existen intentos registrados.</p>
          )}
        </div>
      ) : null}

      {open && composer ? (
        <MobileDialog
          description="Revisa el destinatario y la salida final antes de realizar este envío manual."
          dismissOnOverlayClick={false}
          eyebrow="COMUNICACIONES CON EL CLIENTE"
          onClose={() => {
            if (!pending) setOpen(false);
          }}
          size="xl"
          title={actionLabel}
          variant="fullscreen-mobile"
        >
          <div className="space-y-5">
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
                    {sendState.status === "success" && sendState.cc.length ? (
                      <p className="mt-1 text-xs">CC: {sendState.cc.join(", ")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Cliente" value={composer.customerName} />
              <Detail label="Fecha" value={composer.eventDateLabel} />
              <Detail label="Momento" value={timingLabel(composer.daysUntilEvent)} />
              <Detail label="Tipo de Evento" value={composer.eventType} />
              <Detail
                label="Scrapbook"
                value={composer.model.scrapbookIncluded ? "Incluido" : "No incluido"}
              />
              <Detail
                label="Diseño de fotos"
                value={composer.model.photoDesignPending ? "Pendiente" : "Sin recordatorio"}
              />
              <Detail
                label="Saldo"
                value={
                  composer.model.payment
                    ? formatPreEventCurrency(composer.model.payment.outstandingBalance)
                    : "Pagado / sin saldo"
                }
              />
              <Detail
                label="Vencimiento"
                value={
                  composer.model.payment?.dueDate
                    ? formatPreEventDate(composer.model.payment.dueDate)
                    : composer.model.payment
                      ? "Por confirmar"
                      : "No corresponde"
                }
              />
            </div>
            <label className="block text-sm font-medium">
              PARA
              <input
                className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                disabled={pending || sendState.status === "success"}
                onChange={(event) => setTo(event.target.value)}
                placeholder="cliente@empresa.cl"
                required
                type="email"
                value={to}
              />
              <span className="mt-2 block text-xs font-normal text-muted">
                Se propone el email principal actual del cliente. El cambio aplica sólo a este envío y no modifica el CRM.
              </span>
            </label>
            <label className="block text-sm font-medium">
              CC
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm"
                disabled={pending || sendState.status === "success"}
                onChange={(event) => setCc(event.target.value)}
                placeholder="Un correo por línea o separados por coma"
                value={cc}
              />
              <span className="mt-2 block text-xs font-normal text-muted">
                Puedes quitarlo o cambiarlo sólo para este envío; el CRM permanece intacto.
              </span>
            </label>
            <label className="block text-sm font-medium">
              ASUNTO
              <input
                className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                disabled={pending || sendState.status === "success"}
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>
            <section aria-label="Vista previa real del email" className="space-y-2">
              <p className="text-sm font-medium">VISTA PREVIA</p>
              <p className="text-xs text-muted">
                Esta es la misma salida HTML que se entrega al proveedor. Abrirla no envía ningún email.
              </p>
              <iframe
                className="h-[720px] w-full rounded-2xl border bg-white"
                sandbox=""
                srcDoc={previewHtml}
                title="Vista previa del recordatorio pre-evento"
              />
            </section>
            {confirmingResend ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">
                  ¿Enviar nuevamente el recordatorio pre-evento a {to}?
                </p>
                <p className="mt-1 text-sm">
                  Esta confirmación explícita generará un nuevo registro inmutable.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button disabled={pending} onClick={() => deliver(true)} type="button">
                    Sí, reenviar
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => setConfirmingResend(false)}
                    type="button"
                    variant="outline"
                  >
                    Volver
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {sendState.status === "success"
                  ? sendState.message
                  : to.trim()
                    ? `Se enviará manualmente a ${to}${
                        cc.trim()
                          ? ` · CC: ${cc
                              .split(/[\n,;]+/)
                              .map((value) => value.trim())
                              .filter(Boolean)
                              .join(", ")}`
                          : ""
                      }.`
                    : "Ingresa un destinatario válido para enviar."}
              </p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
                  Cerrar
                </Button>
                <Button
                  disabled={
                    pending ||
                    sendState.status === "success" ||
                    confirmingResend ||
                    !to.trim() ||
                    !subject.trim()
                  }
                  onClick={requestDelivery}
                  type="button"
                >
                  {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {pending ? "Enviando…" : actionLabel}
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
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}
