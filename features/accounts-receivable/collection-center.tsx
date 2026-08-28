"use client";

import Link from "next/link";
import { Mail, MessageSquareText, Search, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { CollectionEmailComposer } from "./collection-email-composer";
import { getLastCollectionNoticeAt } from "./collection-email.template";
import type { CollectionBankDetails } from "./collection-bank-details";
import type { ReceivableDataset, ReceivableInvoice } from "./types";

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
              ["PENDING", "UPCOMING", "OVERDUE", "NO_NOTICE", "WEEK", "HISTORY"] as const
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
  const status = collectionStatus(invoice, today);
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

      <div className="mt-4 flex flex-wrap gap-2">
        {hasEmail ? (
          <CollectionEmailComposer
            bankDetails={bankDetails}
            invoice={invoice}
            label={actionLabel}
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
