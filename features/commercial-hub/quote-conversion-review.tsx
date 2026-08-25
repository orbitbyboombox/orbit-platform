"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import {
  confirmCommercialQuoteConversionAction,
  recoverCommercialQuoteConversionAction,
  type QuoteConversionWarning,
} from "./actions";
import type { QuoteConversionReview } from "./quote-conversion";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function QuoteConversionReviewDialog({
  review,
  onClose,
}: {
  review: QuoteConversionReview;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<{
    projectId: string;
    warnings: QuoteConversionWarning[];
  } | null>(null);
  const submit = () => {
    if (!formRef.current || pending) return;
    const formData = new FormData(formRef.current);
    startTransition(async () => {
      try {
        const result = await confirmCommercialQuoteConversionAction(formData);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok)
          setOutcome({ projectId: result.projectId, warnings: result.warnings });
      } catch {
        const recovered = await recoverCommercialQuoteConversionAction(review.quoteId);
        setMessage(recovered.ok ? recovered.message : recovered.error);
        if (recovered.ok)
          setOutcome({
            projectId: recovered.projectId,
            warnings: recovered.warnings,
          });
      }
    });
  };
  return (
    <MobileDialog
      description="Revisa la información importada. Completa únicamente los datos que no existían en la cotización aceptada."
      dismissOnOverlayClick={!pending}
      eyebrow="Cotización aceptada"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={pending} onClick={onClose} variant="outline">
            {outcome ? "CERRAR" : "Cancelar"}
          </Button>
          {outcome ? (
            <Button asChild>
              <Link href={`/projects/${outcome.projectId}`}>ABRIR EVENTO</Link>
            </Button>
          ) : (
            <Button disabled={pending} onClick={submit}>
              {pending ? "Creando reserva…" : "CONFIRMAR Y CREAR RESERVA"}
            </Button>
          )}
        </div>
      }
      onClose={onClose}
      size="xl"
      title="GENERAR RESERVA"
      variant="fullscreen-mobile"
    >
      <form className="min-w-0 space-y-6" ref={formRef}>
        <input name="quoteId" type="hidden" value={review.quoteId} />
        <section className="rounded-2xl border bg-background/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{review.number}</h3>
              <p className="mt-1 text-sm text-muted">
                Revisión {review.version} · aceptada {formatDate(review.acceptedAt)}
              </p>
            </div>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
              href={`/api/commercial/quotes/${review.quoteId}/pdf`}
              rel="noreferrer"
              target="_blank"
            >
              <FileText className="size-4" /> VER PDF
            </a>
          </div>
        </section>

        {review.missing.length ? (
          <section className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-5" /> Datos requeridos pendientes
            </p>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {review.missing.map((item) => (
                <li className="flex items-center gap-2" key={item}>
                  <span className="size-2 rounded-full bg-amber-500" /> {item}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium">
            <Check className="size-5" /> La cotización contiene todos los datos requeridos.
          </p>
        )}

        <ReviewSection title="Cliente / empresa">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ImportedField label="Empresa / cliente" name="customerCompany" required={!review.customerId&&!review.customer.contact} value={review.customer.company}/>
            <ImportedField label="RUT" name="customerRut" value={review.customer.rut}/>
            <ImportedField label="Contacto" name="customerContact" value={review.customer.contact}/>
            <ImportedField label="Email principal" name="customerEmail" required={!review.customerId} type="email" value={review.customer.email}/>
            <ImportedField label="Teléfono" name="customerPhone" value={review.customer.phone}/>
            <ImportedField label="Dirección" name="customerAddress" value={review.customer.address}/>
          </div>
          {review.customer.secondaryEmail?<p className="text-sm text-muted">Email secundario / CC preservado: {review.customer.secondaryEmail}</p>:null}
        </ReviewSection>

        <ReviewSection title="Evento">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ImportedField label="Evento / proyecto" name="eventName" required value={review.event.name} />
            <ImportedField label="Fecha del evento" name="eventDate" required type="date" value={review.event.date} />
            <ImportedField label="Hora de inicio" name="eventTime" required type="time" value={review.event.time} />
            <ImportedField label="Duración (horas)" min="0.5" name="durationHours" required step="0.5" type="number" value={review.event.durationHours?.toString() ?? ""} />
            <ImportedField label="Lugar / dirección" name="eventLocation" required value={review.event.location} />
            <ImportedField label="Comuna / ciudad" name="eventCity" required value={review.event.city} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Los datos ya importados permanecen bloqueados en esta revisión. Corrige la cotización antes de aceptarla si el origen comercial es incorrecto.
          </p>
        </ReviewSection>

        <ReviewSection title="Servicios y productos aceptados">
          <div className="space-y-2">
            {review.items.map((item) => (
              <article className="grid min-w-0 gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]" key={item.id}>
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.label}</p>
                  <p className="text-xs text-muted">{item.code} · {item.itemType}</p>
                </div>
                <p>Cantidad {item.quantity}</p>
                <p className="font-semibold">{money.format(item.total)}</p>
              </article>
            ))}
          </div>
        </ReviewSection>

        <ReviewSection title="Snapshot financiero aceptado">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Subtotal", review.financial.subtotal],
              ["Descuento", review.financial.discount],
              ["Neto", review.financial.net],
              ["IVA", review.financial.tax],
              ["Total", review.financial.total],
              ["Cobro transporte cliente", review.financial.customerTransportCharge],
              [`Abono ${review.financial.depositPercent}%`, review.financial.deposit],
              ["Saldo", review.financial.balance],
            ].map(([label, value]) => (
              <div className="rounded-xl bg-background/40 p-3" key={String(label)}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-1 font-semibold">{money.format(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Estos valores provienen de la cotización aceptada y no se recalculan desde precios maestros actuales. El costo real de transporte permanece separado.
          </p>
        </ReviewSection>

        <ReviewSection title="OC Cliente (opcional)">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 text-sm">
              <span className="font-medium">Número OC</span>
              <input className="min-h-11 min-w-0 rounded-xl border bg-background px-3" name="purchaseOrderNumber" />
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm">
              <span className="font-medium">ADJUNTAR OC CLIENTE</span>
              <input accept="application/pdf,image/jpeg,image/png" className="min-h-11 min-w-0 rounded-xl border bg-background p-2" name="purchaseOrderFile" type="file" />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">PDF, JPG, JPEG o PNG. Archivo privado; no bloquea la creación de la reserva.</p>
        </ReviewSection>

        {message ? (
          <section
            aria-live="polite"
            className={`rounded-xl border p-4 text-sm font-medium ${outcome ? "border-emerald-500/40 bg-emerald-500/10" : ""}`}
          >
            <p>{message}</p>
            {outcome?.warnings.map((warning) => (
              <p className="mt-2 text-amber-700 dark:text-amber-300" key={`${warning.integration}:${warning.detail}`}>
                Hay una integración pendiente de sincronización: {warning.integration}.
              </p>
            ))}
          </section>
        ) : null}
      </form>
    </MobileDialog>
  );
}

function ImportedField({ label, name, value, required, ...props }: { label:string; name:string; value:string; type?:string; required?:boolean; min?:string; step?:string }) {
  const imported = Boolean(value);
  return <label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">{label}{!imported&&required?<span className="ml-2 text-amber-600">Falta completar</span>:null}</span><input {...props} className="min-h-11 min-w-0 rounded-xl border bg-background px-3 disabled:opacity-80" defaultValue={value} disabled={imported} name={name} required={required}/>{imported?<input name={name} type="hidden" value={value}/>:null}</label>;
}
function ReviewSection({title,children}:{title:string;children:React.ReactNode}){return <section className="min-w-0 space-y-4"><h3 className="text-lg font-semibold">{title}</h3>{children}</section>}
function formatDate(value:string){if(!value)return"sin fecha registrada";return new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
