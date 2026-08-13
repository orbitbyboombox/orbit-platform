import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleCheck, Landmark, ShieldAlert } from "lucide-react";
import type { FinanceDashboardReadModel, FinanceMetric } from "../finance-read-model";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" });
const value = (metric: FinanceMetric) => metric.format === "money" ? money.format(metric.value) : metric.format === "percent" ? `${metric.value.toFixed(1)}%` : number.format(metric.value);
const tone = { default: "text-foreground", success: "text-emerald-400", warning: "text-amber-400", danger: "text-red-400" } as const;

export function FinancialDashboardHeader({ data }: { data: FinanceDashboardReadModel }) {
  return <header className="rounded-3xl border bg-card p-6 sm:p-8" data-workspace-key="FINANCE_DASHBOARD" data-workspace-label="KPIs financieros" data-workspace-section>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Finanzas · Finance Read Model</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Dashboard Financiero</h1><p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">La posición financiera de BOOMBOX, consolidada desde registros canónicos y sin valores manuales.</p></div><p className="text-xs text-muted">Actualizado {dateTime.format(new Date(data.generatedAt))}</p></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{data.headline.map((metric) => <MetricCard key={metric.label} metric={metric} compact />)}</div>
  </header>;
}

export function AvailableCashSection({ data }: { data: FinanceDashboardReadModel["cash"] }) {
  return <DashboardSection eyebrow="Sección 01" title="Caja disponible" description="Saldos observados desde movimientos financieros registrados." workspaceKey="AVAILABLE_CASH">
    <Link className="group flex items-center justify-between rounded-2xl border border-brand/30 bg-brand/[.06] p-5 transition hover:border-brand" href="/finance/cash-flow"><div><p className="text-sm text-muted">Total disponible</p><p className={`mt-2 text-3xl font-semibold ${data.total >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money.format(data.total)}</p></div><Landmark className="size-7 text-brand" /></Link>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{data.accounts.map((account) => <Link className="group rounded-2xl border bg-card p-4 transition hover:border-brand/60" href={account.href} key={account.label}><span className="flex items-center justify-between text-sm text-muted">{account.label}<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span><strong className="mt-3 block text-xl">{money.format(account.value)}</strong></Link>)}</div>
    {Math.abs(data.unassigned) > 0 ? <Link className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-4 text-sm" href="/finance/cash-flow"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400"/><span><strong className="text-amber-300">Sin cuenta identificada: {money.format(data.unassigned)}</strong><span className="mt-1 block text-muted">El total incluye estos movimientos, pero ORBIT no los atribuye a un banco sin evidencia canónica.</span></span></Link> : null}
  </DashboardSection>;
}

export function PeriodMetricsSection({ eyebrow, title, description, metrics, workspaceKey }: { eyebrow: string; title: string; description: string; metrics: FinanceMetric[]; workspaceKey: string }) {
  return <DashboardSection eyebrow={eyebrow} title={title} description={description} workspaceKey={workspaceKey}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div></DashboardSection>;
}

export function FinancialRisksSection({ data }: { data: FinanceDashboardReadModel["risks"] }) {
  return <DashboardSection eyebrow="Sección 05" title="Riesgos financieros" description="Solo alertas accionables; cada una abre el objeto canónico que requiere atención." id="financial-risks" workspaceKey="FINANCIAL_RISKS">
    {data.length ? <div className="grid gap-3 lg:grid-cols-2">{data.map((risk) => <Link className={`group rounded-2xl border p-5 transition ${risk.severity === "danger" ? "border-red-500/30 bg-red-500/[.05] hover:border-red-400" : "border-amber-500/30 bg-amber-500/[.05] hover:border-amber-400"}`} href={risk.href} key={risk.key}><span className="flex items-start justify-between gap-4"><span className="flex gap-3">{risk.severity === "danger" ? <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-400"/> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400"/>}<span><strong className="block">{risk.label}</strong><span className="mt-1 block text-sm text-muted">{risk.detail}</span></span></span><ArrowRight className="mt-1 size-4 shrink-0 transition group-hover:translate-x-1"/></span><span className="mt-4 flex items-baseline justify-between"><strong className="text-2xl">{risk.count}</strong>{risk.amount !== 0 ? <span className="font-semibold">{money.format(risk.amount)}</span> : null}</span></Link>)}</div> : <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[.05] p-5"><CircleCheck className="size-5 text-emerald-400"/><div><p className="font-semibold text-emerald-300">Sin riesgos financieros accionables</p><p className="mt-1 text-sm text-muted">El Finance Read Model no registra alertas abiertas.</p></div></div>}
  </DashboardSection>;
}

function MetricCard({ metric, compact = false }: { metric: FinanceMetric; compact?: boolean }) {
  return <Link className={`group block rounded-2xl border bg-card text-left transition hover:border-brand/60 hover:bg-brand/[.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${compact ? "p-4" : "p-5"}`} href={metric.href}><span className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{metric.label}</span><ArrowRight className="mt-0.5 size-4 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-brand"/></span><strong className={`mt-4 block tracking-tight ${compact ? "text-xl" : "text-2xl"} ${tone[metric.tone ?? "default"]}`}>{value(metric)}</strong><span className="mt-2 block text-xs leading-relaxed text-muted">{metric.detail}</span></Link>;
}

function DashboardSection({ children, description, eyebrow, id, title, workspaceKey }: { children: React.ReactNode; description: string; eyebrow: string; id?: string; title: string; workspaceKey: string }) {
  return <section className="scroll-mt-24 rounded-3xl border bg-card/40 p-5 sm:p-6" data-workspace-key={workspaceKey} data-workspace-label={title} data-workspace-section id={id}><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold">{title}</h2><p className="mt-2 text-sm text-muted">{description}</p></div>{children}</section>;
}
