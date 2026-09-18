"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReceivableInvoice } from "@/features/accounts-receivable/types";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";

export function FinanceIncomeCenter({ invoices }: { invoices: readonly ReceivableInvoice[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [period, setPeriod] = useState("");
  const rows = useMemo(() => invoices.filter((item) => {
    const haystack = `${item.invoiceNumber} ${item.customerName} ${item.customerCompany ?? ""} ${item.projectName} ${item.orbitEventId}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "ALL" || item.status === status) && (!period || item.issueDate?.startsWith(period));
  }), [invoices, period, query, status]);
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  const collected = rows.reduce((sum, item) => sum + item.paidAmount, 0);
  return <main className="space-y-6" aria-label="Ingresos financieros">
    <header className="rounded-3xl border bg-card p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · Ingresos</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Ingresos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Facturación y cobros provenientes de la cuenta por cobrar canónica. Esta vista solo lee registros existentes.</p></header>
    <section className="grid gap-3 sm:grid-cols-3"><Metric label="Total facturado" value={money.format(total)}/><Metric label="Cobrado" value={money.format(collected)}/><Metric label="Saldo pendiente" value={money.format(Math.max(0, total - collected))}/></section>
    <section className="rounded-2xl border bg-card p-4 sm:p-5"><div className="grid gap-3 md:grid-cols-[1fr_170px_170px]"><input aria-label="Buscar ingresos" className="min-h-11 rounded-xl border bg-background px-3 text-sm" onChange={(e) => setQuery(e.target.value)} placeholder="Cliente, Evento o factura" value={query}/><select aria-label="Estado del ingreso" className="min-h-11 rounded-xl border bg-background px-3 text-sm" onChange={(e) => setStatus(e.target.value)} value={status}><option value="ALL">Todos los estados</option>{["ISSUED", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"].map((value) => <option key={value} value={value}>{value}</option>)}</select><input aria-label="Filtrar por período" className="min-h-11 rounded-xl border bg-background px-3 text-sm" onChange={(e) => setPeriod(e.target.value)} type="month" value={period}/></div></section>
    <section className="overflow-hidden rounded-2xl border bg-card"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b bg-background/40 text-xs uppercase tracking-wide text-muted"><tr>{["Factura", "Cliente", "Evento", "Emisión", "Vencimiento", "Total", "Cobrado", "Pendiente", "Estado"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((item) => <tr key={item.id}><td className="px-4 py-4"><Link className="font-semibold text-brand hover:underline" href={`/finance/receivables?invoice=${item.id}`}>{item.invoiceNumber}</Link></td><td className="px-4 py-4">{item.customerName}</td><td className="px-4 py-4">{item.orbitEventId || item.projectName}</td><td className="px-4 py-4">{date(item.issueDate)}</td><td className="px-4 py-4">{date(item.dueDate)}</td><td className="px-4 py-4">{money.format(item.amount)}</td><td className="px-4 py-4">{money.format(item.paidAmount)}</td><td className="px-4 py-4 font-semibold">{money.format(item.outstandingBalance)}</td><td className="px-4 py-4">{item.status}</td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{rows.map((item) => <article className="space-y-2 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><Link className="font-semibold text-brand" href={`/finance/receivables?invoice=${item.id}`}>{item.invoiceNumber}</Link><span className="text-xs text-muted">{item.status}</span></div><p className="text-sm">{item.customerName} · {item.orbitEventId || item.projectName}</p><dl className="grid grid-cols-2 gap-3 text-sm"><Metric label="Total" value={money.format(item.amount)}/><Metric label="Pendiente" value={money.format(item.outstandingBalance)}/></dl></article>)}</div>{!rows.length && <p className="p-10 text-center text-sm text-muted">No hay ingresos para estos filtros.</p>}</section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
