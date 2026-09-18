import Link from "next/link";
import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinanceTaxesPage() {
  const client = await createSupabaseServerClient();
  const data = await loadFinanceDashboardReadModel(client);
  const missing = data.risks.find((risk) => risk.key === "MISSING_TAX_DOCUMENTS");
  const staffReceipts = data.risks.find((risk) => risk.key === "PENDING_STAFF_RECEIPTS");
  return <main className="space-y-6" aria-label="Impuestos"><header className="rounded-3xl border bg-card p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · Impuestos</p><h1 className="mt-2 text-3xl font-semibold">Impuestos y documentación</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Control de respaldo tributario a partir de registros existentes. Los valores de IVA y DTE se muestran solo cuando existe una fuente canónica.</p></header><section className="grid gap-3 sm:grid-cols-2"><Card label="Gastos pagados sin comprobante" value={String(missing?.count ?? 0)} detail={missing?.detail ?? "No hay incidencias abiertas."} href="/finance/expenses?filter=missing-document"/><Card label="Boletas de Staff pendientes" value={String(staffReceipts?.count ?? 0)} detail={staffReceipts?.detail ?? "No hay boletas pendientes."} href="/resources/staff?filter=receipt-pending"/></section><section className="rounded-2xl border border-warning/30 bg-warning/5 p-5"><h2 className="font-semibold">IVA / DTE</h2><p className="mt-2 text-sm leading-6 text-muted">No se calcula IVA ni se crean documentos desde esta vista. Revisa los documentos tributarios canónicos antes de declarar.</p><Link className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline" href="/finance/accountant-export">Abrir exportación contable →</Link></section></main>;
}
function Card({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) { return <Link className="rounded-2xl border bg-card p-5 hover:border-brand/60" href={href}><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-2 text-sm text-muted">{detail}</p></Link>; }
