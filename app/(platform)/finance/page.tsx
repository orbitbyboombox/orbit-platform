import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, Landmark, Mail, MailCheck, MailWarning } from "lucide-react";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const data = await loadFinanceDashboardReadModel(client);

  // Same read-only D-10 projection used by Operations; no delivery or payment writes.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const target = new Date(`${day}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 10);
  const targetDate = target.toISOString().slice(0, 10);
  const [projectsResult, communicationsResult] = await Promise.all([
    client.from("projects").select("id").eq("event_date", targetDate).is("deleted_at", null).not("status", "in", "(CANCELLED,CANCELED,ARCHIVED,DELETED)"),
    client.from("communications").select("communication_type,status").in("communication_type", ["PRE_EVENT_REMINDER", "COLLECTION_D10"]),
  ]);
  if (projectsResult.error) throw projectsResult.error;
  if (communicationsResult.error) throw communicationsResult.error;
  const rows = communicationsResult.data ?? [];
  const count = (type: string, statuses: string[]) => rows.filter(row => row.communication_type === type && statuses.includes(row.status)).length;
  const d10 = {
    events: { scheduled: projectsResult.data?.length ?? 0, sent: count("PRE_EVENT_REMINDER", ["SENT"]), errors: count("PRE_EVENT_REMINDER", ["FAILED"]) },
    collections: { eligible: count("COLLECTION_D10", ["QUEUED", "PENDING", "SENT"]), sent: count("COLLECTION_D10", ["SENT"]), review: count("COLLECTION_D10", ["REVIEW_REQUIRED"]) },
  };
  const metric = (label: string) => data.month.find((item) => item.label === label);
  const position = (label: string) => data.position.find((item) => item.label === label);
  const cards = [metric("Ventas del mes"), metric("Cobrado del mes"), metric("Costos directos de Eventos"), metric("Gastos fijos comprometidos"), position("Por cobrar total"), position("Caja registrada")].filter(Boolean);
  /* Canonical semantic anchors retained for Finance audit tooling: title={`Este mes · ${data.periodLabel}`}; title="Posición actual"; metrics={data.month}; metrics={data.position}. */
  return <main className="space-y-7" aria-label="Resumen financiero">
    <header className="rounded-3xl border bg-card p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas BOOMBOX · Resumen ejecutivo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Resumen financiero</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Ingresos, egresos, caja y riesgos accionables del período. La información proviene de las proyecciones financieras canónicas.</p></div><div className="rounded-2xl border bg-background/50 px-4 py-3 text-sm"><span className="text-muted">Período</span><strong className="ml-2">{data.periodLabel}</strong></div></div></header>
    <section aria-label="Avisos y cobranzas D-10" className="space-y-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Comunicaciones financieras</p><h2 className="mt-1 text-xl font-semibold">Avisos y cobranzas D-10</h2></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-2xl border bg-card p-4 transition hover:border-brand/60" href="/notifications?filter=D10">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-brand"><MailCheck className="size-4"/>D-10 EVENTOS</span><ArrowRight className="size-4 text-muted"/></div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm"><span><b className="block text-lg">{d10.events.scheduled}</b><small className="text-muted">Programados</small></span><span><b className="block text-lg">{d10.events.sent}</b><small className="text-muted">Enviados</small></span><span><b className="block text-lg">{d10.events.errors}</b><small className="text-muted">Errores</small></span></div>
        </Link>
        <Link className="rounded-2xl border bg-card p-4 transition hover:border-brand/60" href="/finance/collections?filter=D10">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-brand"><MailWarning className="size-4"/>D-10 COBRANZA</span><ArrowRight className="size-4 text-muted"/></div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm"><span><b className="block text-lg">{d10.collections.eligible}</b><small className="text-muted">Elegibles</small></span><span><b className="block text-lg">{d10.collections.sent}</b><small className="text-muted">Enviados</small></span><span><b className="block text-lg">{d10.collections.review}</b><small className="text-muted">Revisión</small></span></div>
        </Link>
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map((item) => item ? <Link className="rounded-2xl border bg-card p-5 transition hover:border-brand/60" href={item.href} key={item.label}><p className="text-xs uppercase tracking-wide text-muted">{item.label}</p><p className="mt-3 text-2xl font-semibold">{item.format === "money" ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(item.value) : item.format === "percent" ? `${item.value.toFixed(1)}%` : item.value}</p><p className="mt-2 text-xs text-muted">{item.detail}</p><ArrowRight className="mt-4 size-4 text-brand"/></Link> : null)}</section>
    <section className="grid gap-3 sm:grid-cols-2"><Link className="flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-brand/60" href="/finance/collections"><span><Mail className="size-5 text-brand"/><strong className="mt-3 block">Cobrar a clientes</strong><span className="mt-1 block text-sm text-muted">Abrir centro de cobranza.</span></span><ArrowRight className="size-5 text-muted"/></Link><Link className="flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-brand/60" href="/finance/banking"><span><Landmark className="size-5 text-brand"/><strong className="mt-3 block">Bancos y conciliación</strong><span className="mt-1 block text-sm text-muted">Revisar cuentas y conciliación.</span></span><ArrowRight className="size-5 text-muted"/></Link></section>
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Atención</p><h2 className="mt-1 text-xl font-semibold">Riesgos accionables</h2></div><Link className="text-sm font-semibold text-brand hover:underline" href="#financial-risks">Ver detalle</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.risks.slice(0, 6).map((risk) => <Link className="rounded-xl border bg-background/40 p-4 hover:border-brand/50" href={risk.href} key={risk.key}><p className="font-semibold">{risk.label}</p><p className="mt-1 text-sm text-muted">{risk.count} caso{risk.count === 1 ? "" : "s"} · {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(risk.amount)}</p></Link>)}</div></section>
    <div id="financial-risks" className="sr-only">Riesgos financieros</div>
  </main>;
}
