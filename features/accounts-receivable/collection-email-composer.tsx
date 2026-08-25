"use client";

import { AlertCircle, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import {
  buildCollectionEmailDraft,
  collectionDraftFingerprint,
} from "./collection-email.template";
import { sendCollectionEmailAction } from "./collection-email.actions";
import type { CollectionBankDetails } from "./collection-bank-details";
import type { ReceivableInvoice } from "./types";

function fieldStyle(value: string) {
  return `min-h-11 w-full rounded-xl border bg-background px-3 text-sm ${value ? "" : "text-muted"}`;
}

type SendState =
  | {
      status: "idle";
    }
  | {
      status: "sending";
      recipient: string;
      message: string;
    }
  | {
      status: "success";
      recipient: string;
      sentAt: string;
      communicationId: string;
      providerMessageId: string | null;
      ccRecipients: string[];
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

function formatSentAt(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

export function CollectionEmailComposer({
  invoice,
  bankDetails,
  className,
  label = "Enviar cobranza",
}: {
  invoice: ReceivableInvoice;
  bankDetails: CollectionBankDetails;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [requestId, setRequestId] = useState("");
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const draft = useMemo(
    () => buildCollectionEmailDraft(invoice, bankDetails),
    [bankDetails, invoice],
  );
  const canSend =
    invoice.outstandingBalance > 0 &&
    !["PAID", "CANCELLED", "ARCHIVED"].includes(invoice.status) &&
    Boolean(invoice.customerEmail);

  useEffect(() => {
    if (!open) return;
    const next = buildCollectionEmailDraft(invoice, bankDetails);
    setSubject(next.subject);
    setBody(next.body);
    setCcInput(next.cc.join("\n"));
    setRequestId(crypto.randomUUID());
    setSendState({ status: "idle" });
  }, [bankDetails, invoice, open]);

  const submit = (formData: FormData) => {
    if (pending || sendState.status === "success") return;
    formData.set("invoiceId", invoice.id);
    formData.set("requestId", requestId || crypto.randomUUID());
    setSendState({
      status: "sending",
      recipient: draft.to,
      message: `Enviando... a ${draft.to}${ccInput.trim() ? " con CC aprobado" : ""}.`,
    });
    startTransition(async () => {
      const result = await sendCollectionEmailAction(formData);
      if (result.ok) {
        setSendState({
          status: "success",
          recipient: result.recipient,
          ccRecipients: result.ccRecipients,
          sentAt: result.sentAt,
          communicationId: result.communicationId,
          providerMessageId: result.providerMessageId,
          message:
            `✅ Email enviado a ${result.recipient}.` +
            (result.ccRecipients.length ? ` CC: ${result.ccRecipients.join(", ")}.` : "") +
            (result.deduplicated ? " Ya estaba registrado en el historial." : ""),
        });
        router.refresh();
        return;
      }
      setSendState({
        status: "error",
        message: `❌ No se pudo enviar el email. Intenta nuevamente.${result.error ? ` ${result.error}` : ""}`,
      });
    });
  };

  const canDismiss = sendState.status !== "sending";
  const primaryLabel =
    sendState.status === "success"
      ? "EMAIL ENVIADO"
      : pending
        ? "Enviando..."
        : "Enviar correo";

  return (
    <>
      <button
        className={
          className ??
          "inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-40"
        }
        disabled={!canSend || pending}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Mail className="size-4" />
        {label}
      </button>
      {open && (
        <MobileDialog
          description="Mensaje canónico editable para hacer seguimiento del saldo pendiente."
          eyebrow="Cobranza comercial"
          dismissOnOverlayClick={false}
          onClose={() => {
            if (!canDismiss) return;
            setOpen(false);
          }}
          size="xl"
          title={invoice.invoiceNumber}
          variant="fullscreen-mobile"
        >
          <form action={submit} className="space-y-5">
            <input name="invoiceId" type="hidden" value={invoice.id} />
            <input name="requestId" type="hidden" value={requestId} />
            <input name="templateKey" type="hidden" value={draft.templateKey} />
            <input
              name="expectedDraft"
              type="hidden"
              value={collectionDraftFingerprint(draft)}
            />
            {sendState.status !== "idle" ? (
              <div
                aria-live="polite"
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  sendState.status === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : sendState.status === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-brand/20 bg-brand/5 text-foreground"
                }`}
              >
                <div className="flex items-start gap-2">
                  {sendState.status === "success" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : sendState.status === "error" ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                  )}
                  <div className="space-y-1">
                    <p className="font-medium">{sendState.message}</p>
                    {sendState.status === "success" ? (
                      <p className="text-xs opacity-80">
                        Enviado el {formatSentAt(sendState.sentAt)}.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <section
              className="min-w-0 space-y-3 rounded-2xl border bg-background/40 p-4"
              data-collection-event-summary
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Resumen canónico de la cobranza
                </p>
                <p className="mt-1 text-sm text-muted">
                  Revisa el evento y el saldo vigente antes de enviar.
                </p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Detail label="Cliente" value={invoice.customerName} />
                <Detail label="Fecha del evento" value={draft.eventDateLabel} />
                {draft.eventLocation ? (
                  <Detail label="Lugar" value={draft.eventLocation} />
                ) : null}
                <Detail label="Servicio" value={draft.serviceLabel} />
                <Detail label="Duración" value={draft.durationLabel} />
                <div className="min-w-0 rounded-xl border border-brand/30 bg-brand/10 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Saldo pendiente
                  </p>
                  <p className="mt-1 break-words text-lg font-semibold text-foreground">
                    {draft.outstandingLabel}
                  </p>
                </div>
                <Detail label="Vencimiento" value={draft.dueDateLabel} />
                <Detail label="Para" value={draft.to || "Sin correo"} />
                <Detail
                  label="CC"
                  value={draft.cc.length ? draft.cc.join(", ") : "Sin CC"}
                />
                <Detail label="Estado" value={draft.statusLabel} />
                <Detail label="Último aviso" value={draft.lastNoticeLabel} />
                <Detail
                  label="Plantilla"
                  value={draft.templateKey === "OVERDUE" ? "Vencida" : "Por vencer"}
                />
              </div>
            </section>
            <label className="block min-w-0 text-sm font-medium">
              CC
              <span className="mt-2 block">
                <textarea
                  className="min-h-24 w-full min-w-0 rounded-xl border bg-background p-3 text-sm"
                  name="cc"
                  onChange={(event) => setCcInput(event.target.value)}
                  placeholder="Un correo por línea o separados por coma"
                  value={ccInput}
                />
              </span>
              <span className="mt-2 block text-xs font-normal text-muted">
                El email secundario permanente se sugiere automáticamente. Puedes quitarlo o agregar CC sólo para este envío.
              </span>
            </label>
            <div className="grid gap-3 rounded-2xl border bg-background/40 p-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2 xl:col-span-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Datos bancarios BOOMBOX
                </p>
                <p className="mt-1 text-sm text-muted">
                  Estos datos se insertan automáticamente en la cobranza profesional.
                </p>
              </div>
              <Detail label="Banco" value={draft.bankDetails.bankName} />
              <Detail label="Tipo de cuenta" value={draft.bankDetails.accountType} />
              <Detail label="N° de cuenta" value={draft.bankDetails.accountNumber} />
              <Detail label="RUT" value={draft.bankDetails.rut} />
              <Detail
                label="Email de transferencia"
                value={draft.bankDetails.email}
              />
              <Detail label="Marca" value={draft.bankDetails.companyLabel} />
            </div>
            <label className="block text-sm font-medium">
              Asunto
              <span className="mt-2 block">
                <input
                  className={fieldStyle(subject)}
                  name="subject"
                  onChange={(event) => setSubject(event.target.value)}
                  value={subject}
                />
              </span>
            </label>
            <label className="block text-sm font-medium">
              Cuerpo
              <span className="mt-2 block">
                <textarea
                  className="min-h-60 w-full rounded-xl border bg-background p-3 text-sm"
                  name="body"
                  onChange={(event) => setBody(event.target.value)}
                  value={body}
                />
              </span>
            </label>
            <div className="flex flex-col gap-3 border-t bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {sendState.status === "success"
                  ? `✅ Email enviado a ${sendState.recipient}.`
                  : sendState.status === "error"
                    ? sendState.message
                    : canSend
                      ? `Se enviará a ${draft.to}${ccInput.trim() ? ` · CC: ${ccInput.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).join(", ")}` : ""}.`
                      : "El saldo debe estar activo y el cliente debe tener correo registrado."}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setOpen(false)} type="button" variant="outline">
                  Cancelar
                </Button>
                <Button
                  disabled={pending || !canSend || sendState.status === "success"}
                  type="submit"
                >
                  {sendState.status === "success" ? (
                    <CheckCircle2 className="size-4" />
                  ) : pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {primaryLabel}
                </Button>
              </div>
            </div>
          </form>
        </MobileDialog>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
