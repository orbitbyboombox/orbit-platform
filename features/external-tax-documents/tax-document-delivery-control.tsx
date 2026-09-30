"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import {
  getTaxDocumentDeliveryPreviewAction,
  sendTaxDocumentDeliveryAction,
} from "./delivery.actions";
import {
  renderTaxDocumentDeliveryHtml,
} from "@/features/connectors/google-gmail/application/tax-document-delivery.template";
import type { TaxDocumentDeliveryComposer } from "@/features/connectors/google-gmail/application/tax-document-delivery.service";

export function TaxDocumentDeliveryControl({
  projectId,
  documentId,
  initialSentAt,
}: {
  projectId: string;
  documentId: string;
  initialSentAt?: string;
}) {
  const [pending, startTransition] = useTransition();
  const gate = useRef(false);
  const [composer, setComposer] = useState<TaxDocumentDeliveryComposer | null>(null);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [requestId, setRequestId] = useState("");
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const openComposer = () =>
    startTransition(async () => {
      const result = await getTaxDocumentDeliveryPreviewAction(projectId, documentId);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }
      setComposer(result.preview);
      setTo(result.preview.to);
      setCc(result.preview.cc.join("\n"));
      setSubject(result.preview.subject);
      setRequestId(crypto.randomUUID());
      setConfirmingResend(false);
      setFeedback(null);
      gate.current = false;
      setOpen(true);
    });

  const deliver = (confirmResend: boolean) => {
    if (!composer || pending || gate.current) return;
    gate.current = true;
    setConfirmingResend(false);
    startTransition(async () => {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("documentId", documentId);
      form.set("requestId", requestId || crypto.randomUUID());
      form.set("expectedFingerprint", composer.fingerprint);
      form.set("to", to);
      form.set("cc", cc);
      form.set("subject", subject);
      form.set("confirmResend", String(confirmResend));
      const result = await sendTaxDocumentDeliveryAction(form);
      gate.current = false;
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }
      setFeedback({ kind: "success", message: result.message });
      const refreshed = await getTaxDocumentDeliveryPreviewAction(projectId, documentId);
      if (refreshed.ok) setComposer(refreshed.preview);
    });
  };

  const requestDelivery = () => {
    if (composer?.hasSuccessfulSend) {
      setConfirmingResend(true);
      return;
    }
    deliver(false);
  };

  const previewHtml = composer ? renderTaxDocumentDeliveryHtml(composer.model) : "";

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button
          aria-busy={pending}
          disabled={pending}
          onClick={openComposer}
          size="sm"
          type="button"
          variant="outline"
        >
          {pending ? <OrbitLoader variant="button" /> : <Mail className="size-4" />}
          {initialSentAt ? "Reenviar al cliente" : "Enviar al cliente"}
        </Button>
        {initialSentAt ? (
          <span className="text-[11px] text-emerald-600">
            ✓ Enviado {new Date(initialSentAt).toLocaleDateString("es-CL")}
          </span>
        ) : null}
      </div>

      {open && composer ? (
        <MobileDialog
          description="Revisa el destinatario y la vista previa del correo premium antes de enviar."
          dismissOnOverlayClick={false}
          eyebrow="DOCUMENTO TRIBUTARIO"
          onClose={() => !pending && setOpen(false)}
          size="xl"
          title={composer.hasSuccessfulSend ? "Reenviar documento tributario" : "Enviar documento tributario"}
          variant="fullscreen-mobile"
        >
          <div className="space-y-5">
            {feedback ? (
              <div
                className={`rounded-xl border p-4 text-sm ${feedback.kind === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"}`}
              >
                <div className="flex gap-2">
                  {feedback.kind === "success" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              </div>
            ) : null}

            <label className="block text-sm font-medium">
              PARA
              <input
                className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
                disabled={pending}
                onChange={(event) => setTo(event.target.value)}
                type="email"
                value={to}
              />
            </label>
            <label className="block text-sm font-medium">
              CC
              <textarea
                className="mt-2 min-h-20 w-full rounded-xl border bg-background p-3"
                disabled={pending}
                onChange={(event) => setCc(event.target.value)}
                value={cc}
              />
            </label>
            <label className="block text-sm font-medium">
              ASUNTO
              <input
                className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
                disabled={pending}
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>

            <section className="space-y-2" aria-label="Vista previa real del correo">
              <p className="text-sm font-medium">VISTA PREVIA</p>
              <p className="text-xs text-muted">
                El archivo tributario real se adjuntará automáticamente al correo.
              </p>
              <iframe
                className="h-[680px] w-full rounded-2xl border bg-white"
                sandbox=""
                srcDoc={previewHtml}
                title="Vista previa documento tributario"
              />
            </section>

            {confirmingResend ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">¿Enviar nuevamente este documento a {to}?</p>
                <p className="mt-1 text-sm">
                  ORBIT guardará un nuevo registro de envío en el Timeline.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button disabled={pending} onClick={() => deliver(true)} type="button">
                    Sí, reenviar
                  </Button>
                  <Button disabled={pending} onClick={() => setConfirmingResend(false)} type="button" variant="outline">
                    Volver
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {composer.hasSuccessfulSend
                  ? "Este documento ya tiene un envío registrado. Puedes reenviarlo si corresponde."
                  : "El envío quedará registrado en Comunicaciones y Timeline."}
              </p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
                  Cerrar
                </Button>
                <Button
                  disabled={pending || !to.trim() || !subject.trim()}
                  onClick={requestDelivery}
                  type="button"
                >
                  {pending ? <OrbitLoader variant="button" /> : <Send className="size-4" />}
                  {composer.hasSuccessfulSend ? "Reenviar" : "Enviar al cliente"}
                </Button>
              </div>
            </div>
          </div>
        </MobileDialog>
      ) : null}
    </>
  );
}
