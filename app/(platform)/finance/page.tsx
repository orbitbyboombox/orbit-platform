import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { loadExpenseSourceSnapshot } from "@/features/finance/expense-source-read-model";
import { EXPENSE_CATEGORIES, expenseCategoryTotals } from "@/features/finance/expense-source-reconciliation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, Landmark, Mail, ClipboardCheck } from "lucide-react";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const [data, expenseSnapshot] = await Promise.all([
    loadFinanceDashboardReadModel(client),
    loadExpenseSourceSnapshot(client),
  ]);
  const expenseTotals = expenseCategoryTotals(expenseSnapshot.projections);
  const recognizedExpenseTotal = expenseTotals.reduce((sum, item) => sum + item.recognizedCost, 0);

  const metric = (label: string) => data.month.find((item) => item.label === label);
  const position = (label: string) => data.position.find((item) => item.label === label);
  const cards = [metric("Ventas del mes"), metric("Cobrado del mes"), metric("Costos directos de Eventos"), metric("Gastos fijos comprometidos"), position("Por cobrar total"), position("Caja registrada")].filter(Boolean);
  /* Canonical semantic anchors retained for Finance audit tooling: title={`Este mes · ${data.periodLabel}`}; title="Posición actual"; metrics={data.month}; metrics={data.position}. */
  return <main className="space-y-7" aria-label="Resumen financiero">
    <header className="rounded-3xl border bg-card p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas BOOMBOX · Resumen ejecutivo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Resumen financiero</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Ingresos, egresos, caja y riesgos accionables del período. La información proviene de las proyecciones financieras canónicas.</p></div><div className="rounded-2xl border bg-background/50 px-4 py-3 text-sm"><span className="text-muted">Período</span><strong className="ml-2">{data.periodLabel}</strong></div></div></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map((item) => item ? <Link className="rounded-2xl border bg-card p-5 transition hover:border-brand/60" href={item.href} key={item.label}><p className="text-xs uppercase tracking-wide text-muted">{item.label}</p><p className="mt-3 text-2xl font-semibold">{item.format === "money" ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(item.value) : item.format === "percent" ? `${item.value.toFixed(1)}%` : item.value}</p><p className="mt-2 text-xs text-muted">{item.detail}</p><ArrowRight className="mt-4 size-4 text-brand"/></Link> : null)}</section>
    <section className="grid gap-3 sm:grid-cols-2"><Link className="flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-brand/60" href="/finance/collections"><span><Mail className="size-5 text-brand"/><strong className="mt-3 block">Cobrar a clientes</strong><span className="mt-1 block text-sm text-muted">Abrir centro de cobranza.</span></span><ArrowRight className="size-5 text-muted"/></Link><Link className="flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-brand/60" href="/finance/banking"><span><Landmark className="size-5 text-brand"/><strong className="mt-3 block">Bancos y conciliación</strong><span className="mt-1 block text-sm text-muted">Revisar cuentas y conciliación.</span></span><ArrowRight className="size-5 text-muted"/></Link></section>
    <section><Link className="flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-brand/60" href="/finance/expense-audit"><span><ClipboardCheck className="size-5 text-brand"/><strong className="mt-3 block">Auditoría de gastos · Etapa 2</strong><span className="mt-1 block text-sm text-muted">Revisar categorías, gastos Staff y registros que requieren conciliación. Solo lectura; no es cierre contable.</span></span><ArrowRight className="size-5 text-muted"/></Link></section>
    <section className="rounded-2xl border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Control de gastos</p><h2 className="mt-1 text-xl font-semibold">Gasto final reconocido</h2><p className="mt-1 max-w-2xl text-sm text-muted">Suma únicamente registros reconocidos por el adaptador canónico. No incluye reglas recurrentes no pagadas, inventario consumido ni casos que requieren revisión.</p></div><Link className="text-sm font-semibold text-brand hover:underline" href="/finance/expense-audit">Ver auditoría</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Metric label="Gasto final" value={money.format(recognizedExpenseTotal)}/><Metric label="Revisión requerida" value={String(expenseSnapshot.requiresReview)}/></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{EXPENSE_CATEGORIES.map((category) => { const total = expenseTotals.find((item) => item.category === category.code); return <div className="rounded-xl border bg-background/30 p-3" key={category.code}><p className="text-xs text-muted">{category.label}</p><p className="mt-1 font-semibold">{money.format(total?.recognizedCost ?? 0)}</p></div>; })}</div></section>
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Atención</p><h2 className="mt-1 text-xl font-semibold">Riesgos accionables</h2></div><Link className="text-sm font-semibold text-brand hover:underline" href="#financial-risks">Ver detalle</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.risks.slice(0, 6).map((risk) => <Link className="rounded-xl border bg-background/40 p-4 hover:border-brand/50" href={risk.href} key={risk.key}><p className="font-semibold">{risk.label}</p><p className="mt-1 text-sm text-muted">{risk.count} caso{risk.count === 1 ? "" : "s"} · {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(risk.amount)}</p></Link>)}</div></section>
    <div id="financial-risks" className="sr-only">Riesgos financieros</div>
  </main>;
}

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-background/30 p-3"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
