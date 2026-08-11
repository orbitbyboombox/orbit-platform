"use client";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  ReceiptText,
  Search,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import type {
  PaymentTerm,
  ReceivableDataset,
  ReceivableInvoice,
} from "./types";
const money = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(`${v}T12:00:00Z`))
    : "Sin fecha";
const statuses: Record<
  string,
  {
    label: string;
    variant: "neutral" | "info" | "warning" | "success" | "danger";
  }
> = {
  DRAFT: { label: "Borrador", variant: "neutral" },
  ISSUED: { label: "Emitida", variant: "info" },
  PENDING: { label: "Pendiente", variant: "warning" },
  PARTIALLY_PAID: { label: "Pago parcial", variant: "warning" },
  PAID: { label: "Pagada", variant: "success" },
  OVERDUE: { label: "Vencida", variant: "danger" },
  CANCELLED: { label: "Anulada", variant: "neutral" },
};
const terms: readonly [PaymentTerm, string][] = [
  ["CASH", "Contado"],
  ["DAYS_15", "15 días"],
  ["DAYS_30", "30 días"],
  ["DAYS_45", "45 días"],
  ["DAYS_60", "60 días"],
  ["DAYS_90", "90 días"],
  ["CUSTOM", "Personalizado"],
];
export function AccountsReceivableCenter({
  dataset,
}: {
  dataset: ReceivableDataset;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const invoices = useMemo(
    () =>
      dataset.invoices.filter(
        (x) =>
          (status === "ALL" || x.status === status) &&
          `${x.invoiceNumber} ${x.customerName} ${x.projectName} ${x.orbitEventId}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [dataset.invoices, query, status],
  );
  const rows = [
    [
      "Factura",
      "Cliente",
      "Evento",
      "Estado",
      "Monto",
      "Pagado",
      "Saldo",
      "Vencimiento",
    ],
    ...dataset.invoices.map((x) => [
      x.invoiceNumber,
      x.customerName,
      x.projectName,
      statuses[x.status].label,
      String(x.amount),
      String(x.paidAmount),
      String(x.outstandingBalance),
      x.dueDate ?? "",
    ]),
  ];
  return (
    <WorkspaceLayout
      header={null}
      timeline={null}
      copilot={null}
      className="max-w-none p-0"
      mainContent={
        <main className="space-y-6 pb-10">
          <section className="rounded-3xl border bg-card p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <StatusBadge label="Datos productivos" variant="success" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-brand">
                  Finanzas · Cobranza
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Cuentas por Cobrar
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Vista de consulta para facturas, saldos, movimientos y
                  vencimientos. La gestión de pagos se realiza dentro de cada
                  Evento.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()}>
                  <FileText />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      rows,
                      "cuentas-por-cobrar.xls",
                      "application/vnd.ms-excel",
                      true,
                    )
                  }
                >
                  <FileSpreadsheet />
                  Excel
                </Button>
                <Button
                  onClick={() =>
                    download(rows, "cuentas-por-cobrar.csv", "text/csv", false)
                  }
                >
                  <Download />
                  CSV
                </Button>
              </div>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<WalletCards />}
              label="Cuentas por cobrar"
              value={money(dataset.metrics.accountsReceivable)}
            />
            <Kpi
              icon={<Landmark />}
              label="Saldo pendiente"
              value={money(dataset.metrics.outstandingBalance)}
            />
            <Kpi
              icon={<TriangleAlert />}
              label="Saldo vencido"
              value={money(dataset.metrics.overdueBalance)}
              danger={dataset.metrics.overdueBalance > 0}
            />
            <Kpi
              icon={<CalendarClock />}
              label="Días promedio de cobro"
              value={
                dataset.metrics.averageCollectionDays === null
                  ? "Sin historial"
                  : `${dataset.metrics.averageCollectionDays} días`
              }
            />
          </section>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.75fr)]">
            <div className="space-y-5">
              <div className="rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="relative flex-1">
                    <Search className="absolute left-3 top-3.5 size-4 text-muted" />
                    <span className="sr-only">Buscar</span>
                    <input
                      className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm"
                      placeholder="Buscar factura, cliente o evento"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filtrar por estado"
                    className="min-h-11 rounded-xl border bg-background px-3 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="ALL">Todos los estados</option>
                    {Object.entries(statuses).map(([v, p]) => (
                      <option key={v} value={v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                {invoices.length ? (
                  invoices.map((invoice) => (
                    <InvoiceCard key={invoice.id} invoice={invoice} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
                    <ReceiptText className="mx-auto size-8 text-brand" />
                    <p className="mt-4 font-semibold">
                      No hay facturas en esta vista.
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Cuando emitas una factura desde una cotización aprobada,
                      su seguimiento aparecerá aquí.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <aside className="space-y-6">
              <section className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
                  Solo consulta
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  Gestión desde el Evento
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Abre el Evento correspondiente para registrar reservas, pagos
                  parciales, pagos totales, reversas o cancelaciones. Finance se
                  actualiza automáticamente.
                </p>
              </section>
              <section className="rounded-2xl border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">
                  Aging
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  Antigüedad de saldos
                </h2>
                <div className="mt-4 space-y-3">
                  {Object.entries(dataset.metrics.aging).map(
                    ([label, value]) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm">
                          <span>{label} días</span>
                          <span className="font-medium">{money(value)}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-background">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{
                              width: `${dataset.metrics.overdueBalance ? Math.min(100, (value / dataset.metrics.overdueBalance) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            </aside>
          </section>
          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Relación financiera
            </p>
            <h2 className="mt-2 text-xl font-semibold">Crédito por cliente</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {dataset.customers
                .filter((x) => x.totalInvoiced > 0)
                .map((x) => (
                  <article className="rounded-xl border p-4" key={x.id}>
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold">{x.name}</p>
                      <StatusBadge
                        label={
                          x.creditHistory === "AL_DIA"
                            ? "Al día"
                            : x.creditHistory === "CON_ATRASO"
                              ? "Con atraso"
                              : "Sin historial"
                        }
                        variant={
                          x.creditHistory === "CON_ATRASO"
                            ? "danger"
                            : x.creditHistory === "AL_DIA"
                              ? "success"
                              : "neutral"
                        }
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <Small label="Facturado" value={money(x.totalInvoiced)} />
                      <Small
                        label="Pendiente"
                        value={money(x.outstandingBalance)}
                      />
                      <Small
                        label="Vencidas"
                        value={String(x.overdueInvoices)}
                      />
                      <Small
                        label="Pago promedio"
                        value={
                          x.averagePaymentDays === null
                            ? "Sin datos"
                            : `${x.averagePaymentDays} días`
                        }
                      />
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </main>
      }
      bottomAction={null}
    />
  );
}
function InvoiceCard({ invoice }: { invoice: ReceivableInvoice }) {
  const p = statuses[invoice.status];
  return (
    <article className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{invoice.invoiceNumber}</p>
            <StatusBadge label={p.label} variant={p.variant} />
            <StatusBadge
              label={
                invoice.customerType === "CORPORATE" ? "Empresa" : "Particular"
              }
              variant="neutral"
            />
          </div>
          <p className="mt-2 text-sm">
            {invoice.customerName} · {invoice.projectName}
          </p>
          <p className="mt-1 text-xs text-muted">{invoice.orbitEventId}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xl font-semibold">
            {money(invoice.outstandingBalance)}
          </p>
          <p className="text-xs text-muted">de {money(invoice.amount)}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
        <Small label="Emitida" value={date(invoice.issueDate)} />
        <Small label="Vence" value={date(invoice.dueDate)} />
        <Small
          label="Condición"
          value={
            terms.find(([v]) => v === invoice.paymentTerm)?.[1] ??
            invoice.paymentTerm
          }
        />
        <Small
          label="Días"
          value={
            invoice.daysRemaining === null
              ? "—"
              : invoice.daysRemaining < 0
                ? `${Math.abs(invoice.daysRemaining)} vencidos`
                : String(invoice.daysRemaining)
          }
        />
      </div>
      <a
        className="mt-4 inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-medium hover:border-brand"
        href={`/projects/${invoice.projectId}#payment-management`}
      >
        Gestionar desde el Evento
      </a>
    </article>
  );
}
function Kpi({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border bg-card p-4 sm:p-5 ${danger ? "border-danger/30" : ""}`}
    >
      <span
        className={`grid size-9 place-items-center rounded-lg ${danger ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"}`}
      >
        {icon}
      </span>
      <p className="mt-4 text-xl font-semibold sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </article>
  );
}
function Small({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
function download(
  rows: string[][],
  name: string,
  type: string,
  excel: boolean,
) {
  const content = excel
    ? `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`).join("")}</table>`
    : rows
        .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(";"))
        .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([excel ? `\ufeff${content}` : `\ufeff${content}`], { type }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function escape(v: string) {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
