"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, ExternalLink, Flag, ReceiptText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CollectionBankDetails } from "./collection-bank-details";
import type { ReceivableDataset, ReceivableInvoice } from "./types";
import { classifyReceivableBucket, isReceivablePastDue } from "./payment-term-classification";
import {
  filterReceivables,
  isFutureReceivable,
  pendingReceivableTotal,
  sortFinishedReceivables,
  sortFutureReceivables,
  sortPaidHistory,
  uniqueReceivables,
  type ReceivableViewFilter,
} from "./receivables-view-model";
import { CollectionEmailComposer } from "./collection-email-composer";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(value));
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "Sin fecha";
const today = () => new Date().toISOString().slice(0, 10);

function categoryLabel(row: ReceivableInvoice): string {
  const bucket = classifyReceivableBucket(row.projectType);
  return bucket === "MARRIAGES" ? "Matrimonio" : bucket === "BUSINESS_EVENTS" ? "Empresa / evento" : "Revisión de clasificación";
}

function statusLabel(row: ReceivableInvoice): { label: string; variant: "warning" | "danger" | "info" | "success" } {
  if (isReceivablePastDue({ status: row.status, daysRemaining: row.daysRemaining })) return { label: "Vencido", variant: "danger" };
  if (row.paidAmount > 0) return { label: "Parcial", variant: "warning" };
  return { label: "Vigente", variant: "info" };
}

function ReceivableItem({ row, bankDetails, marked, onToggle }: { row: ReceivableInvoice; bankDetails: CollectionBankDetails; marked: boolean; onToggle: () => void }) {
  const status = statusLabel(row);
  return (
    <article className="min-w-0 rounded-2xl border bg-card p-4 transition hover:border-brand/50 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{row.customerName}</p>
          <Link className="mt-1 block truncate text-sm text-muted hover:text-brand" href={`/projects/${row.projectId}`}>{row.projectName}</Link>
          <p className="mt-1 text-xs text-muted">{row.service} · {categoryLabel(row)}</p>
        </div>
        <StatusBadge label={status.label} variant={status.variant} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Evento</dt><dd className="mt-1 font-medium">{date(row.eventDate)}</dd></div>
        <div><dt className="text-xs text-muted">Vencimiento</dt><dd className="mt-1 font-medium">{date(row.dueDate)}</dd></div>
        <div><dt className="text-xs text-muted">Total · abonos</dt><dd className="mt-1 font-medium">{money(row.amount)} · {money(row.paidAmount)}</dd></div>
        <div><dt className="text-xs text-muted">Saldo pendiente</dt><dd className="mt-1 text-lg font-semibold text-brand">{money(row.outstandingBalance)}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-background px-2.5 py-1 text-xs text-muted">{row.invoiceNumber}</span>
        {marked ? <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">Marcado para cobrar</span> : null}
        {classifyReceivableBucket(row.projectType) === "REVIEW" ? <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">Requiere revisión</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button className="min-h-9" onClick={onToggle} variant={marked ? "default" : "outline"}>
          {marked ? <CheckCircle2 className="size-4" /> : <Flag className="size-4" />}
          {marked ? "Marcado" : "Marcar para cobrar"}
        </Button>
        <Link className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:border-brand/60" href={`/projects/${row.projectId}`}><ExternalLink className="size-4" />Abrir evento</Link>
        {row.outstandingBalance > 0 ? <CollectionEmailComposer bankDetails={bankDetails} className="inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium hover:border-brand/60" invoice={row} label="Enviar cobranza" /> : null}
      </div>
    </article>
  );
}

export function ReceivablesOperationsView({ dataset, bankDetails, initialInvoiceId }: { dataset: ReceivableDataset; bankDetails: CollectionBankDetails; initialInvoiceId?: string }) {
  const [filter, setFilter] = useState<ReceivableViewFilter>("ALL");
  const [view, setView] = useState<"FINISHED" | "FUTURE" | "HISTORY">("FINISHED");
  const [query, setQuery] = useState("");
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const active = useMemo(() => uniqueReceivables(dataset.invoices).filter((row) => row.outstandingBalance > 0), [dataset.invoices]);
  const history = useMemo(() => sortPaidHistory(dataset.historyInvoices.filter((row) => row.outstandingBalance <= 0 || row.status === "PAID")), [dataset.historyInvoices]);
  const pendingTotal = pendingReceivableTotal(active);
  const canonicalTotal = Math.round(dataset.metrics.outstandingBalance);
  const reconciliationPass = Math.round(pendingTotal) === canonicalTotal;
  const rows = useMemo(() => {
    const filtered = filterReceivables(view === "HISTORY" ? history : active, filter).filter((row) => {
      if (!query) return true;
      const text = `${row.customerName} ${row.projectName} ${row.service} ${row.invoiceNumber}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
    if (view === "HISTORY") return filtered;
    const finished = filtered.filter((row) => !isFutureReceivable(row, today()));
    const future = filtered.filter((row) => isFutureReceivable(row, today()));
    return view === "FUTURE" ? sortFutureReceivables(future) : sortFinishedReceivables(finished);
  }, [active, filter, history, query, view]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("orbit.receivables.follow-up.v1") ?? "[]");
      if (Array.isArray(saved)) setMarked(new Set(saved.filter((value): value is string => typeof value === "string")));
    } catch { /* local marker is optional and never affects financial data */ }
  }, []);
  useEffect(() => {
    if (!initialInvoiceId) return;
    const invoice = dataset.invoices.find((row) => row.id === initialInvoiceId) ?? dataset.historyInvoices.find((row) => row.id === initialInvoiceId);
    if (!invoice) return;
    setQuery(invoice.invoiceNumber);
    setView(invoice.outstandingBalance > 0 ? (isFutureReceivable(invoice, today()) ? "FUTURE" : "FINISHED") : "HISTORY");
  }, [dataset.historyInvoices, dataset.invoices, initialInvoiceId]);
  const toggleMarked = (invoiceId: string) => {
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(invoiceId)) next.delete(invoiceId); else next.add(invoiceId);
      try { window.localStorage.setItem("orbit.receivables.follow-up.v1", JSON.stringify([...next])); } catch { /* best effort only */ }
      return next;
    });
  };
  return (
    <main className="flex flex-col gap-5 pb-10" id="receivables-workspace" data-workspace-section="RECEIVABLES_OPERATIONS">
      <header className="rounded-3xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · Por cobrar</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Por cobrar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Una sola vista operativa de saldos reales, vencimientos y seguimiento. Las cifras se leen de la proyección canónica.</p></div>
          <div className="rounded-2xl border bg-background/40 p-4 text-right"><p className="text-xs uppercase tracking-wide text-muted">Saldo total pendiente</p><p className="mt-1 text-3xl font-semibold text-brand">{money(pendingTotal)}</p><p className={`mt-1 text-xs ${reconciliationPass ? "text-success" : "text-warning"}`}>{reconciliationPass ? "Conciliado con la proyección" : "Requiere revisión de conciliación"}</p></div>
        </div>
      </header>
      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Seguimiento de cuentas</h2><p className="mt-1 text-xs text-muted">Las deudas aparecen automáticamente; la marca solo organiza el trabajo de cobranza.</p></div><span className="inline-flex items-center gap-1 text-xs text-muted"><CircleDollarSign className="size-4 text-brand" /> {active.length} cuentas pendientes</span></div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Vista de cuentas por cobrar">
          {( [["FINISHED", "Eventos terminados"], ["FUTURE", "Eventos futuros"], ["HISTORY", "Historial pagado"]] as [typeof view, string][]).map(([value, label]) => <Button key={value} onClick={() => setView(value)} variant={view === value ? "default" : "outline"}>{label}</Button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtro por categoría">
          {( [["ALL", "Todos"], ["MARRIAGES", "Matrimonios"], ["BUSINESS_EVENTS", "Empresas y eventos"]] as [ReceivableViewFilter, string][]).map(([value, label]) => <button className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-brand text-black" : "bg-background text-muted"}`} key={value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <label className="relative mt-4 block max-w-xl"><Search className="absolute left-3 top-3.5 size-4 text-muted" /><span className="sr-only">Buscar cliente o evento</span><input className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, evento o servicio" value={query} /></label>
      </section>
      <section className="space-y-3" data-receivable-view={view}>
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{view === "HISTORY" ? "Historial" : view === "FUTURE" ? "Eventos futuros" : "Eventos terminados"}</p><h2 className="mt-1 text-xl font-semibold">{rows.length} registro{rows.length === 1 ? "" : "s"}</h2></div><span className="text-sm text-muted">{view === "HISTORY" ? "Más recientes primero" : view === "FUTURE" ? "Orden cronológico del evento" : "Vencidos primero · luego vencimiento"}</span></div>
        {rows.length ? <div className="grid min-w-0 gap-3 lg:grid-cols-2">{rows.map((row) => <ReceivableItem bankDetails={bankDetails} key={row.id} marked={marked.has(row.id)} onToggle={() => toggleMarked(row.id)} row={row} />)}</div> : <div className="rounded-2xl border bg-card p-10 text-center"><ReceiptText className="mx-auto size-8 text-brand" /><p className="mt-3 font-semibold">No hay registros para estos filtros.</p><p className="mt-1 text-sm text-muted">Las cuentas sin clasificación aparecen igualmente en Todos para revisión.</p></div>}
      </section>
    </main>
  );
}
