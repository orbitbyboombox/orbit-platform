import { loadExpenseSourceSnapshot } from "@/features/finance/expense-source-read-model";
import { EXPENSE_CATEGORIES, expenseCategoryTotals } from "@/features/finance/expense-source-reconciliation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

const clp = (amount: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);

export default async function FinanceExpenseAuditPage() {
  const client = await createSupabaseServerClient();
  const snapshot = await loadExpenseSourceSnapshot(client);
  const totals = expenseCategoryTotals(snapshot.projections);
  const reviewed = snapshot.projections.filter((item) => item.integrity === "REVIEW_REQUIRED");
  const reviewReasons = Array.from(new Set(reviewed.flatMap((item) => item.reviewReasons))).map((reason) => ({ reason, count: reviewed.filter((item) => item.reviewReasons.includes(reason)).length })).sort((a, b) => b.count - a.count);
  return <main className="space-y-6" aria-label="Auditoría de gastos">
    <header className="rounded-3xl border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Finanzas BOOMBOX · Etapa 2</p>
      <h1 className="mt-2 text-3xl font-semibold">Auditoría de gastos</h1>
      <p className="mt-2 text-sm text-muted">Vista de diagnóstico de solo lectura. No es un cierre contable ni un saldo bancario; no modifica pagos, gastos o inventario.</p>
      <Link href="/finance/expenses" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Ir al centro de gastos</Link>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Gastos registrados", snapshot.sourceCounts.expenses],
        ["Solicitudes Staff", snapshot.sourceCounts.staffSubmissions],
        ["Reembolsos", snapshot.sourceCounts.reimbursements],
        ["Liquidaciones Staff", snapshot.sourceCounts.staffSettlements],
      ].map(([label, count]) => <div className="rounded-2xl border bg-card p-4" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{count}</p></div>)}
    </section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Seis categorías de gastos</h2>
      <p className="mt-1 text-sm text-muted">Costo provisional de registros reconocidos sin alertas. No incluye pagos bancarios confirmados; no utilizar como gasto final de la empresa.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{EXPENSE_CATEGORIES.map((category) => {
        const total = totals.find((item) => item.category === category.code);
        return <div className="rounded-xl border p-4" key={category.code}><p className="text-sm text-muted">{category.label}</p><p className="mt-2 text-xl font-semibold">{clp(total?.recognizedCost ?? 0)}</p></div>;
      })}</div>
    </section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Pendientes de revisión: {snapshot.requiresReview}</h2>
      <p className="mt-1 text-sm text-muted">Estos registros se excluyen de los subtotales anteriores hasta validar su origen y relación económica.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{reviewReasons.map(({ reason, count }) => <div className="rounded-xl border p-3" key={reason}><p className="text-xs text-muted">{reason}</p><p className="mt-1 text-lg font-semibold">{count} registro{count === 1 ? "" : "s"}</p></div>)}</div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Detalle de registros con alerta</p>
      <div className="mt-2 space-y-2">{reviewed.slice(0, 50).map((row) => <div className="rounded-lg border p-3 text-sm" key={row.key}><p className="font-medium">{row.source} · {row.id}</p><p className="mt-1 text-muted">{row.reviewReasons.join(", ")}</p></div>)}</div>
      {reviewed.length > 50 ? <p className="mt-3 text-xs text-muted">Se muestran los primeros 50 casos; el total incluye todos los registros analizados.</p> : null}
    </section>
  </main>;
}
