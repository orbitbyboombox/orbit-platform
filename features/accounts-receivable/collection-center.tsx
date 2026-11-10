"use client";

import Link from "next/link";
import { Mail, MessageSquareText, Search, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { CollectionEmailComposer } from "./collection-email-composer";
import { getLastCollectionNoticeAt } from "./collection-email.template";
import type { CollectionBankDetails } from "./collection-bank-details";
import type { ReceivableDataset, ReceivableInvoice } from "./types";
import { isD10ManualCollectionDue } from "./d10-manual-collection";
import { setD10CollectionDateAction } from "./d10-manual-collection.actions";
import { resolveCollectionEmailStatus } from "./collection-email-status";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeZone: "America/Santiago",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00-04:00`))
    : "Sin fecha";

const daysSince = (value: string | null) => {
  if (!value) return null;
  const diff =
    (Date.now() - new Date(value).getTime()) /
    (24 * 60 * 60 * 1000);
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff)) : null;
};

export type CollectionFilter =
  | "PENDING"
  | "UPCOMING"
  | "OVERDUE"
  | "NO_NOTICE"
  | "WEEK"
  | "D10"
  | "HISTORY";

const filterMeta: Record<
  CollectionFilter,
  { label: string; description: string }
> = {
  PENDING: { label: "TODOS PENDIENTES", description: "Cuentas activas con saldo." },
  UPCOMING: { label: "POR VENCER", description: "Fechas futuras de pago." },
  OVERDUE: { label: "VENCIDOS", description: "Saldo exigible vencido." },
  NO_NOTICE: { label: "SIN AVISO", description: "Sin contacto previo." },
  WEEK: { label: "AVISADOS ESTA SEMANA", description: "Con último aviso reciente." },
  D10: { label: "D-10 MANUAL", description: "Eventos a 10 días con saldo pendiente." },
  HISTORY: { label: "PAGADOS / HISTÓRICO", description: "Historial de cobranza." },
};

function latestNotice(invoice: ReceivableInvoice) {
  return getLastCollectionNoticeAt(invoice.collectionActions);
}

function isOverdue(invoice: ReceivableInvoice, today: string) {
  return Boolean(invoice.dueDate) && invoice.dueDate! < today;
}

function collectionStatus(invoice: ReceivableInvoice, today: string) {
  if (invoice.outstandingBalance <= 0 || invoice.status === "PAID") return "PAGADO";
  if (isOverdue(invoice, today)) return "VENCIDO";
  if (invoice.dueDate === today) return "VENCE HOY";
  return "POR VENCER";
}

function priorityRank(invoice: ReceivableInvoice, today: string) {
  const notice = latestNotice(invoice);
  const recent = daysSince(notice);
  if (invoice.outstandingBalance <= 0) return 99;
  if (isOverdue(invoice, today) && recent === null) return 0;
  if (isOverdue(invoice, today)) return 1;
  if (invoice.dueDate === today) return 2;
  if (invoice.daysRemaining !== null && invoice.daysRemaining > 0 && invoice.daysRemaining <= 7) return 3;
  if (recent !== null && recent <= 7) return 4;
  return 5;
}

export function CollectionCenter({
  dataset,
  bankDetails,
  initialFilter = "PENDING",
}: {
  dataset: ReceivableDataset;
  bankDetails: CollectionBankDetails;
  initialFilter?: CollectionFilter;
}) {
  const [filter, setFilter] = useState<CollectionFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());

  const actionable = useMemo(
    () =>
      dataset.invoices
        .filter((invoice) => invoice.outstandingBalance > 0 && invoice.status !== "CANCELLED")
        .filter((invoice) => {
          const text = [
            invoice.customerName,
            invoice.customerCompany ?? "",
            invoice.projectName,
            invoice.service,
            invoice.invoiceNumber,
            invoice.customerEmail ?? "",
            invoice.customerPhone ?? "",
            invoice.purchaseOrder ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return !query || text.includes(query.toLowerCase());
        })
        .filter((invoice) => {
          if (filter === "PENDING") return true;
          if (filter === "UPCOMING") return invoice.daysRemaining !== null && invoice.daysRemaining > 0;
          if (filter === "OVERDUE") return isOverdue(invoice, today);
          if (filter === "NO_NOTICE") return !latestNotice(invoice);
          if (filter === "WEEK") {
            const notice = latestNotice(invoice);
            const recent = daysSince(notice);
            return recent !== null && recent <= 7;
          }
          if (filter === "D10") return isD10ManualCollectionDue({
            eventDate: invoice.eventDate,
            outstandingBalance: invoice.outstandingBalance,
            status: invoice.status,
            scheduledFor: invoice.d10CollectionDate,
          }, today);
          return false;
        })
        .sort((left, right) => {
          const rank = priorityRank(left, today) - priorityRank(right, today);
          if (rank !== 0) return rank;
          return (left.dueDate ?? left.issueDate ?? "").localeCompare(
            right.dueDate ?? right.issueDate ?? "",
          );
        }),
    [dataset.invoices, filter, query, today],
  );

  const history = useMemo(
    () =>
      dataset.historyInvoices
        .filter((invoice) => {
          const text = [
            invoice.customerName,
            invoice.customerCompany ?? "",
            invoice.projectName,
            invoice.service,
            invoice.invoiceNumber,
            invoice.customerEmail ?? "",
            invoice.customerPhone ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return !query || text.includes(query.toLowerCase());
        })
        .sort((left, right) =>
          (right.dueDate ?? right.issueDate ?? "").localeCompare(
            left.dueDate ?? left.issueDate ?? "",
          ),
        ),
    [dataset.historyInvoices, query],
  );

  const rows = filter === "HISTORY" ? history : actionable;
  const emailHistory = useMemo(() => (dataset.collectionEmailHistory ?? []).filter((item) => {
    const text = [item.customerName, item.customerCompany ?? "", item.eventName, item.eventCode, item.recipient].join(" ").toLowerCase();
    return !query || text.includes(query.toLowerCase());
  }), [dataset.collectionEmailHistory, query]);
  const summaryOutstanding = dataset.metrics.outstandingBalance;
  const summaryOverdue = actionable
    .filter((invoice) => isOverdue(invoice, today))
    .reduce((sum, invoice) => sum + invoice.outstandingBalance, 0);
  const summaryUpcoming = actionable
    .filter((invoice) => invoice.daysRemaining !== null && invoice.daysRemaining > 0)
    .reduce((sum, invoice) => sum + invoice.outstandingBalance, 0);
  const summaryContacts = new Set(actionable.map((invoice) => invoice.customerId)).size;

  return (
    <main className="flex flex-col gap-6 pb-10">
      <section className="rounded-3xl border bg-card p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Finanzas · Cobranza comercial
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Cobrar a Clientes
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Un centro operativo para revisar quién debe, priorizar vencidos y enviar correos
          profesionales de cobranza sin alterar saldos ni registros financieros.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="TOTAL POR COBRAR" value={money(summaryOutstanding)} detail="Saldo canónico vigente" />
        <Stat label="POR VENCER" value={money(summaryUpcoming)} detail="Pendientes con fecha futura" />
        <Stat label="VENCIDO" value={money(summaryOverdue)} detail="Saldo con plazo vencido" />
        <Stat label="CLIENTES A CONTACTAR" value={String(summaryContacts)} detail="Clientes únicos con saldo" />
      </section>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              Datos bancarios BOOMBOX
            </p>
            <h2 className="mt-2 text-xl font-semibold">Se insertan automáticamente en cada correo</h2>
            <p className="mt-1 text-sm text-muted">
              El mensaje sigue siendo editable por Founder, pero la información bancaria
              viene desde la configuración canónica de ORBIT.
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl border bg-background/50 p-4 sm:grid-cols-2">
            <BankDetail label="Marca" value={bankDetails.companyLabel} />
            <BankDetail label="Banco" value={bankDetails.bankName} />
            <BankDetail label="Tipo de cuenta" value={bankDetails.accountType} />
            <BankDetail label="N° de cuenta" value={bankDetails.accountNumber} />
            <BankDetail label="RUT" value={bankDetails.rut} />
            <BankDetail label="Email de transferencia" value={bankDetails.email} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-3.5 size-4 text-muted" />
            <span className="sr-only">Buscar cliente, empresa, evento o factura</span>
            <input
              className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, empresa, evento o factura"
              value={query}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              ["PENDING", "UPCOMING", "OVERDUE", "NO_NOTICE", "WEEK", "D10", "HISTORY"] as const
            ).map((key) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-border bg-background text-muted hover:text-foreground"
                }`}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {filterMeta[key].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {rows.map((invoice) => (
          <CollectionCard
            bankDetails={bankDetails}
            filter={filter}
            invoice={invoice}
            key={invoice.id}
            today={today}
          />
        ))}
        {!rows.length ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-sm text-muted xl:col-span-2">
            No hay cuentas para estos filtros.
          </div>
        ) : null}
      </section>

      <section aria-labelledby="collection-email-history-title" className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Trazabilidad de correo</p>
            <h2 id="collection-email-history-title" className="mt-1 text-xl font-semibold">Historial real de cobranzas</h2>
            <p className="mt-1 text-sm text-muted">El estado ENVIADO requiere confirmación de Gmail; los registros pendientes y fallidos se conservan.</p>
          </div>
          <span className="text-sm text-muted">{emailHistory.length} registro{emailHistory.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3 font-semibold">Cliente</th>
                <th className="px-3 py-3 font-semibold">Evento</th>
                <th className="px-3 py-3 font-semibold">Destinatario</th>
                <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                <th className="px-3 py-3 font-semibold">Fecha y hora</th>
                <th className="px-3 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {emailHistory.map((item) => (
                <tr className="border-b last:border-0" key={item.id} data-collection-email-id={item.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.customerName}</p>
                    {item.customerCompany ? <p className="mt-0.5 text-xs text-muted">{item.customerCompany}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.eventName}</p>
                    <p className="mt-0.5 text-xs text-muted">{item.eventCode}{item.internalNotificationRecorded ? " · Aviso ORBIT registrado" : ""}</p>
                  </td>
                  <td className="px-3 py-3">{item.recipient}</td>
                  <td className="px-3 py-3 text-right font-semibold">{item.balance === null ? "Saldo sin registro" : money(item.balance)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{dateTime(item.occurredAt)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      item.status === "ENVIADO"
                        ? "border-success/30 bg-success/5 text-success"
                        : item.status === "FALLIDO"
                          ? "border-danger/30 bg-danger/5 text-danger"
                          : "border-amber-400/40 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                    }`}>{item.status}</span>
                  </td>
                </tr>
              ))}
              {!emailHistory.length ? (
                <tr><td className="px-3 py-8 text-center text-sm text-muted" colSpan={6}>Aún no hay correos de cobranza registrados.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CollectionCard({
  invoice,
  bankDetails,
  filter,
  today,
}: {
  invoice: ReceivableInvoice;
  bankDetails: CollectionBankDetails;
  filter: CollectionFilter;
  today: string;
}) {
  const noticeAt = latestNotice(invoice);
  const noticeDays = daysSince(noticeAt);
  const actionLabel = noticeAt ? "REENVIAR COBRANZA" : "ENVIAR EMAIL";
  const isD10 = isD10ManualCollectionDue({ eventDate: invoice.eventDate, outstandingBalance: invoice.outstandingBalance, status: invoice.status, scheduledFor: invoice.d10CollectionDate }, today);
  const status = collectionStatus(invoice, today);
  const emailStatus = resolveCollectionEmailStatus(
    invoice.collectionActions
      .filter((item) => ["PAYMENT_REMINDER", "COLLECTION_EMAIL", "COLLECTION_D10", "COLLECTION_OVERDUE_AUTOMATIC"].includes(item.type))
      .map((item) => ({
        id: item.id,
        status: item.status,
        occurredAt: item.occurredAt,
        sentAt: item.sentAt,
        toRecipient: item.toRecipient,
        createdBy: item.createdBy,
        sentBy: item.sentBy,
        failureReason: item.failureReason,
        externalMessageId: item.externalMessageId,
      })),
  );
  const hasEmail = Boolean(invoice.customerEmail);
  const contactPath = `/customers/${invoice.customerId}`;

  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
            {invoice.customerType === "CORPORATE" ? "Empresa" : "Cliente"} · {status}
          </p>
          <h3 className="mt-2 truncate text-xl font-semibold">
            {invoice.customerCompany ?? invoice.customerName}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {invoice.customerCompany && invoice.customerCompany !== invoice.customerName
              ? invoice.customerName
              : invoice.customerType === "CORPORATE"
                ? "Empresa"
                : "Cliente particular"}
            {" · "}
            {invoice.projectName} · {invoice.service}
          </p>
          <p className="mt-1 text-xs text-muted">{invoice.invoiceNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{money(invoice.outstandingBalance)}</p>
          <p className="text-xs text-muted">Saldo pendiente</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Total" value={money(invoice.amount)} />
        <Info label="Pagado" value={money(invoice.paidAmount)} />
        <Info label="Vencimiento" value={date(invoice.dueDate)} />
        <Info
          label="Último aviso"
          value={noticeAt ? `${date(noticeAt)}${noticeDays !== null ? ` · hace ${noticeDays} día${noticeDays === 1 ? "" : "s"}` : ""}` : "Sin aviso"}
        />
      </dl>

      <CollectionEmailStatusBadge invoice={invoice} emailStatus={emailStatus} />

      <div className="mt-4 flex flex-wrap gap-2">
        {hasEmail ? (
          <CollectionEmailComposer
            bankDetails={bankDetails}
            invoice={invoice}
            label={isD10 ? "REVISAR / ENVIAR D-10" : actionLabel}
          />
        ) : (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition hover:border-brand/50"
            href={contactPath}
          >
            <Mail className="size-4" />
            CLIENTE SIN EMAIL
          </Link>
        )}
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition hover:border-brand/50"
          href={contactPath}
        >
          <MessageSquareText className="size-4" />
          Abrir cliente
        </Link>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition hover:border-brand/50"
          href={`/projects/${invoice.projectId}`}
        >
          <WalletCards className="size-4" />
          Abrir evento
        </Link>
      </div>

      {isD10 ? <D10ScheduleEditor invoice={invoice} /> : null}

      <details className="mt-4 rounded-2xl border bg-background/40 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-brand">
          Historial de cobranza
        </summary>
        <div className="mt-4 space-y-3">
          {invoice.collectionActions.length ? (
            invoice.collectionActions.map((item) => (
              <div className="border-l-2 border-brand/30 pl-3" key={item.id}>
                <p className="text-sm font-medium">
                  {item.type === "COLLECTION_EMAIL" ? "Cobranza por email" : item.type.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {date(item.occurredAt)} · {item.channel} · {item.status}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Sin avisos de cobranza registrados.</p>
          )}
        </div>
      </details>

      {filter !== "HISTORY" ? (
        <p className="mt-3 text-xs text-muted">
          Última actualización financiera derivada del ledger canónico. El correo no
          altera saldos.
        </p>
      ) : null}
    </article>
  );
}

function CollectionEmailStatusBadge({
  invoice,
  emailStatus,
}: {
  invoice: ReceivableInvoice;
  emailStatus: ReturnType<typeof resolveCollectionEmailStatus>;
}) {
  if (invoice.outstandingBalance <= 0 || invoice.status === "PAID") {
    return <p className="mt-4 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-sm font-semibold text-success">PAGADO · Cobranza pendiente retirada</p>;
  }
  const tone = emailStatus.state === "SENT"
    ? "border-success/30 bg-success/5 text-success"
    : emailStatus.state === "FAILED"
      ? "border-danger/30 bg-danger/5 text-danger"
      : "border-amber-400/40 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200";
  return (
    <div className={`mt-4 rounded-xl border px-3 py-2 ${tone}`} data-collection-email-status={emailStatus.state}>
      <p className="text-sm font-semibold">{emailStatus.label}</p>
      {emailStatus.state === "SENT" ? (
        <p className="mt-1 text-xs">
          {emailStatus.sentAt ? dateTime(emailStatus.sentAt) : "Fecha no registrada"}
          {emailStatus.recipient ? ` · ${emailStatus.recipient}` : ""}
          {emailStatus.actorId ? ` · ${emailStatus.actorId}` : ""}
        </p>
      ) : null}
      {emailStatus.state === "FAILED" ? (
        <p className="mt-1 text-xs">{emailStatus.failureReason ?? "Revisa el historial para conocer el detalle."}</p>
      ) : null}
    </div>
  );
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function D10ScheduleEditor({ invoice }: { invoice: ReceivableInvoice }) {
  const [scheduledFor, setScheduledFor] = useState(invoice.d10CollectionDate ?? "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return <form className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-3" onSubmit={async (event) => {
    event.preventDefault(); setSaving(true); setMessage(null);
    try { const form = new FormData(); form.set("projectId", invoice.projectId); form.set("scheduledFor", scheduledFor); form.set("reason", reason); await setD10CollectionDateAction(form); setMessage("Fecha D-10 guardada."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar la fecha."); }
    finally { setSaving(false); }
  }}>
    <p className="text-xs font-semibold uppercase tracking-wide text-brand">Cobranza D-10 manual</p>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1 text-xs font-medium">Fecha de revisión<input className="mt-1 min-h-10 w-full rounded-lg border bg-background px-2 text-sm" type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
      <label className="flex-1 text-xs font-medium">Motivo (opcional)<input className="mt-1 min-h-10 w-full rounded-lg border bg-background px-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="min-h-10 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-foreground disabled:opacity-50" disabled={saving} type="submit">{saving ? "GUARDANDO…" : "GUARDAR FECHA"}</button>
    </div>
    {message ? <p className="mt-2 text-xs text-muted">{message}</p> : null}
  </form>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function BankDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
