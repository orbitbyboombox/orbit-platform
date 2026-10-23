"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  FileText,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptCommercialQuoteAction,
  loadCommercialQuoteConversionReviewAction,
} from "./actions";
import {
  quoteDetailActions,
  type CommercialQuoteDetail,
} from "./quote-detail";
import { QuoteConversionReviewDialog } from "./quote-conversion-review";
import type { QuoteConversionReview } from "./quote-conversion";
import type { CommercialHubData } from "./types";

const FormalBuilder = dynamic(() =>
  import("./commercial-hub").then((module) => module.FormalBuilder),
);

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CommercialQuoteDetailExperience({
  quote,
  hubData,
}: {
  quote: CommercialQuoteDetail;
  hubData?: CommercialHubData;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<QuoteConversionReview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const actions = quoteDetailActions(quote.status, quote.projectId);

  if (editing && quote.draft && hubData) {
    return (
      <main className="mx-auto w-full max-w-[1480px] space-y-5 p-4 sm:p-6 lg:p-8" data-workspace-ignore>
        <button
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"
          onClick={() => setEditing(false)}
          type="button"
        >
          <ArrowLeft className="size-4" /> Volver al detalle
        </button>
        <FormalBuilder data={hubData} initialDraft={quote.draft} />
      </main>
    );
  }

  const accept = () => {
    if (
      !window.confirm(
        `¿Confirmar que ${quote.number} fue aceptada por el cliente? Esta acción conservará el snapshot comercial aceptado.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await acceptCommercialQuoteAction(quote.id);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };

  const openConversion = () => {
    startTransition(async () => {
      const result = await loadCommercialQuoteConversionReviewAction(quote.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.converted) {
        router.push(`/projects/${result.projectId}`);
        return;
      }
      setReview(result.review);
    });
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" data-workspace-ignore>
      <header className="space-y-5">
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"
          href={quote.customerId ? `/customers/${quote.customerId}` : "/leads"}
        >
          <ArrowLeft className="size-4" />
          {quote.customerId ? "Volver al Cliente" : "Volver a Cotizar"}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Cotización comercial canónica
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {quote.number}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Revisión {quote.version} · creada {formatDateTime(quote.createdAt)}
            </p>
          </div>
          <span className="w-fit rounded-full border px-3 py-1.5 text-xs font-semibold">
            {statusLabel(quote.status)}
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-brand/30 bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold">Acción comercial</h2>
            <p className="mt-1 text-sm text-muted">
              {actionExplanation(quote.status)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline">
              <a
                href={`/api/commercial/quotes/${quote.id}/pdf`}
                rel="noreferrer"
                target="_blank"
              >
                <FileText /> VER PDF
              </a>
            </Button>
            {actions.canEdit && quote.draft && hubData ? (
              <Button onClick={() => setEditing(true)}>
                <FilePenLine /> CONTINUAR EDITANDO
              </Button>
            ) : null}
            {actions.canAccept ? (
              <Button disabled={pending} onClick={accept}>
                <CheckCircle2 />
                {pending ? "GUARDANDO…" : "MARCAR COMO ACEPTADA"}
              </Button>
            ) : null}
            {actions.canConvert ? (
              <Button disabled={pending} onClick={openConversion}>
                {pending
                  ? "PREPARANDO…"
                  : "GENERAR RESERVA DESDE COTIZACIÓN"}
              </Button>
            ) : null}
            {actions.isConverted ? (
              <>
                <span className="inline-flex min-h-11 items-center font-semibold text-success">
                  RESERVA YA GENERADA
                </span>
                <Button asChild>
                  <Link href={`/projects/${quote.projectId}`}>
                    VER EVENTO <ExternalLink />
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {message ? (
          <p aria-live="polite" className="mt-4 rounded-xl border p-3 text-sm font-medium">
            {message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Cliente / empresa">
          <dl className="space-y-3 text-sm">
            <Datum label="Empresa" value={quote.customer.company} />
            <Datum label="RUT" value={quote.customer.rut} />
            <Datum label="Contacto" value={quote.customer.contact} />
            <Datum label="Email principal" value={quote.customer.email} />
            <Datum
              label="Email secundario / CC"
              value={quote.customer.secondaryEmail}
            />
            <Datum label="Teléfono" value={quote.customer.phone} />
            <Datum label="Dirección" value={quote.customer.address} />
          </dl>
        </Card>
        <Card title="Evento informado">
          <dl className="space-y-3 text-sm">
            <Datum label="Evento / proyecto" value={quote.event.name} />
            <Datum label="Fecha" value={formatDate(quote.event.date)} />
            <Datum label="Hora" value={quote.event.time} />
            <Datum label="Lugar / dirección" value={quote.event.location} />
            <Datum label="Comuna / ciudad" value={quote.event.city} />
            <Datum label="Fecha de emisión" value={formatDate(quote.issueDate)} />
            <Datum
              label="Vigencia hasta"
              value={formatDate(quote.expirationDate)}
            />
          </dl>
        </Card>
      </section>

      <Card title="Servicios e ítems">
        <div className="space-y-2">
          {quote.items.map((item) => (
            <article
              className="grid min-w-0 gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
              key={item.id}
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{item.label}</p>
                <p className="text-xs text-muted">
                  {item.code} · {item.itemType}
                </p>
              </div>
              <p>Cantidad {item.quantity}</p>
              <p>{money.format(item.quotedPrice)} c/u</p>
              <p className="font-semibold">{money.format(item.total)}</p>
            </article>
          ))}
        </div>
      </Card>

      <Card title={quote.acceptedAt ? "Snapshot financiero aceptado" : "Resumen financiero"}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Subtotal", quote.financial.subtotal],
            ["Descuento", quote.financial.discount],
            ["Neto", quote.financial.net],
            ["IVA", quote.financial.tax],
            ["Total", quote.financial.total],
            [`Abono ${quote.financial.depositPercent}%`, quote.financial.deposit],
            ["Saldo", quote.financial.balance],
          ].map(([label, value]) => (
            <div className="rounded-xl bg-background/40 p-3" key={String(label)}>
              <dt className="text-muted">{label}</dt>
              <dd className="mt-1 font-semibold">{money.format(Number(value))}</dd>
            </div>
          ))}
        </dl>
        {quote.acceptedAt ? (
          <p className="mt-4 text-xs text-muted">
            Aceptada {formatDateTime(quote.acceptedAt)}
            {quote.acceptedByFounder ? " por Founder / Administración" : ""}. Estos valores son inmutables.
          </p>
        ) : null}
      </Card>

      {quote.conditions.length ? (
        <Card title="Condiciones comerciales">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            {quote.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Historial comercial">
        <div className="space-y-3">
          {quote.history.map((entry) => (
            <article className="border-l-2 border-brand/50 pl-3" key={entry.id}>
              <p className="text-sm font-medium">{entry.label}</p>
              <p className="mt-1 text-sm text-muted">{entry.detail}</p>
              <p className="mt-1 text-xs text-muted">
                {formatDateTime(entry.occurredAt)}
              </p>
            </article>
          ))}
        </div>
      </Card>

      {review ? (
        <QuoteConversionReviewDialog
          onClose={() => setReview(null)}
          review={review}
        />
      ) : null}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">
        {value || "Por completar"}
      </dd>
    </div>
  );
}

function statusLabel(status: string) {
  return (
    {
      DRAFT: "BORRADOR",
      SENT: "ENVIADA",
      VIEWED: "ENVIADA / VISTA",
      ACCEPTED: "ACEPTADA",
      CONVERTED: "CONVERTIDA A RESERVA",
      REJECTED: "RECHAZADA",
      EXPIRED: "VENCIDA",
    } as Record<string, string>
  )[status] ?? status;
}

function actionExplanation(status: string) {
  if (status === "DRAFT")
    return "Continúa editando y utiliza el envío normal. Un borrador no puede crear una reserva.";
  if (["SENT", "VIEWED"].includes(status))
    return "Cuando el cliente confirme su aceptación, regístrala explícitamente antes de generar la reserva.";
  if (status === "ACCEPTED")
    return "Revisa los datos importados y completa únicamente la información operacional faltante.";
  if (status === "CONVERTED")
    return "Esta cotización ya pertenece a un único Evento canónico.";
  return "La cotización se conserva como parte del historial comercial.";
}

function formatDate(value: string) {
  if (!value) return "Por completar";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
}

function formatDateTime(value: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}
