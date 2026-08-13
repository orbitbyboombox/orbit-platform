"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  FilePlus2,
  ReceiptText,
  Settings2,
  TrendingUp,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import type { FinanceDashboardReadModel, FinanceMetric } from "@/features/finance/finance-read-model";
import { PersonalWorkspaceSections } from "./personal-workspace";
import { reviewStaffRequestAction } from "@/features/operations/operations-planning.actions";

export type CommandCenterItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  time?: string;
  tone?: "default" | "success" | "info" | "warning" | "danger";
};

export type CommandCenterEvent = CommandCenterItem & {
  date: string;
  service: string;
  location: string;
  staff: string;
  status: string;
};

export type PendingStaffApproval = {
  id: string;
  projectId: string;
  collaborator: string;
  event: string;
  role: string;
  estimatedPayment: number;
};

const quickActions = [
  { label: "Nuevo Evento", href: "/projects?reservation=new", icon: FilePlus2 },
  { label: "Calendario", href: "/projects?view=calendar", icon: CalendarDays },
  { label: "Staff", href: "/resources/staff", icon: UsersRound },
  { label: "Registrar Gasto", href: "/finance/expenses?action=new", icon: ReceiptText },
] as const;

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const formatMetric = (metric: FinanceMetric) => metric.format === "money" ? money(metric.value) : metric.format === "percent" ? `${metric.value.toFixed(1)}%` : new Intl.NumberFormat("es-CL").format(metric.value);
const toneStyle = {
  default: "bg-accent text-muted",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export function FounderWorkspaceExperience({ currentDate, finance, founderName, operationalAlerts, pendingStaffApprovals, pendingTasks, publicationConsole, recentActivity, todayEvents, todayOperation, upcomingEvents }: {
  currentDate: string;
  finance: FinanceDashboardReadModel;
  founderName: string;
  operationalAlerts: CommandCenterItem[];
  pendingStaffApprovals: PendingStaffApproval[];
  pendingTasks: number;
  publicationConsole?: React.ReactNode;
  recentActivity: CommandCenterItem[];
  todayEvents: number;
  todayOperation: CommandCenterItem[];
  upcomingEvents: CommandCenterEvent[];
}) {
  const router = useRouter();
  const [resolvedApprovalIds, setResolvedApprovalIds] = useState<Set<string>>(() => new Set());
  const staffApprovalItems = pendingStaffApprovals.filter((item) => !resolvedApprovalIds.has(item.id));
  const headline = (label: string) => finance.headline.find(item => item.label === label);
  const fallback = (label: string, href: string): FinanceMetric => ({ label, value: 0, format: "money", detail: "Sin movimientos canónicos.", href });
  const kpis: Array<{ metric: FinanceMetric; icon: LucideIcon; tone: keyof typeof toneStyle }> = [
    { metric: headline("Caja disponible") ?? fallback("Caja disponible", "/finance/cash-flow"), icon: WalletCards, tone: "info" },
    { metric: headline("Ventas") ?? fallback("Ventas del mes", "/projects?period=month"), icon: TrendingUp, tone: "success" },
    { metric: headline("Por cobrar") ?? fallback("Cobros pendientes", "/finance/receivables"), icon: CircleDollarSign, tone: "warning" },
    { metric: { label: "Eventos hoy", value: todayEvents, format: "count", detail: "Agenda operacional de hoy.", href: "/projects?date=today" }, icon: CalendarDays, tone: "default" },
    { metric: { label: "Producción activa", value: todayOperation.length, format: "count", detail: "Eventos y prioridades activas.", href: "/operations" }, icon: Wrench, tone: "danger" },
    { metric: headline("Margen") ?? { label: "Rentabilidad", value: 0, format: "percent", detail: "Margen neto del mes.", href: "/projects?view=profitability" }, icon: TrendingUp, tone: "info" },
  ];

  const welcome = <header className="pb-1 pt-2 sm:pb-2 sm:pt-4">
    <p data-command-label>Founder Command Center</p>
    <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-.05em] sm:text-[2.6rem]">Buenos días, {founderName} <span aria-hidden>👋</span></h1>
    <p className="mt-2 text-sm capitalize text-muted">{currentDate}</p>
    <p className="mt-4 text-sm text-muted">{todayEvents} eventos hoy <span className="px-1.5 text-border">·</span> {pendingTasks} prioridades pendientes</p>
  </header>;

  const founderKpis = <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {kpis.map(({ metric, icon: Icon, tone }) => <button data-command-card className="group min-h-[7.75rem] rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 sm:p-[1.05rem]" key={metric.label} onClick={() => router.push(metric.href)}>
      <span className="flex items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneStyle[tone]}`}><Icon className="size-[18px]" /></span><span className="text-[.7rem] font-medium leading-4 text-muted">{metric.label}</span></span>
      <strong className="orbit-counter mt-3 block text-[1.55rem] leading-none tracking-[-.04em]">{formatMetric(metric)}</strong>
      <span className="mt-2 block truncate text-[10px] text-muted">{metric.detail}</span>
    </button>)}
  </section>;

  const today = <section data-command-card aria-labelledby="today-operation-title" className="rounded-2xl border p-5 sm:p-6">
    <PanelTitle id="today-operation-title" label="Centro operacional · Hoy" />
    <div className="relative mt-5 before:absolute before:bottom-5 before:left-[4.1rem] before:top-5 before:w-px before:bg-border">
      {todayOperation.slice(0, 6).map(item => <Link className="group relative grid grid-cols-[3.25rem_1rem_1fr_auto] items-center gap-3 border-b border-border/70 py-4 first:pt-1 last:border-0 last:pb-1" href={item.href} key={item.id}>
        <time className="font-mono text-xs font-semibold text-foreground">{item.time ?? "Ahora"}</time>
        <span className={`relative z-10 size-2.5 rounded-full ring-4 ring-card ${item.tone === "danger" ? "bg-danger" : item.tone === "warning" ? "bg-warning" : "bg-brand"}`} />
        <span className="min-w-0"><strong className="block truncate text-sm">{item.title}</strong><span className="mt-1 block truncate text-xs text-muted">{item.detail}</span></span>
        <span className="flex items-center gap-3"><StatusPill tone={item.tone} /><span className="grid size-8 place-items-center rounded-lg border text-muted transition group-hover:border-brand/40 group-hover:text-brand"><ArrowRight className="size-4" /></span></span>
      </Link>)}
      {!todayOperation.length ? <Empty label="No hay prioridades operacionales para hoy." /> : null}
    </div>
  </section>;

  const upcoming = <section data-command-card aria-labelledby="upcoming-events-title" className="rounded-2xl border p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><PanelTitle id="upcoming-events-title" label="Próximos eventos" /><Link className="text-xs text-muted transition hover:text-brand" href="/projects?view=calendar">Ver calendario</Link></div>
    <div className="mt-4 divide-y">{upcomingEvents.slice(0, 4).map(event => <Link className="group grid grid-cols-[3.25rem_1fr_auto] gap-3 py-3.5 first:pt-0 last:pb-0" href={event.href} key={event.id}>
      <span className="grid min-h-14 place-items-center rounded-xl border bg-background/50 text-center"><strong className="block text-lg leading-none">{event.date.split(" ")[0]}</strong><span className="text-[9px] font-semibold uppercase text-muted">{event.date.split(" ").slice(1).join(" ")}</span></span>
      <span className="min-w-0"><strong className="block truncate text-sm">{event.title}</strong><span className="mt-1 block truncate text-xs text-muted">{event.service}</span><span className="mt-1 block truncate text-[11px] text-muted">{event.location || "Ubicación pendiente"} · {event.staff}</span></span>
      <span className="self-start rounded-lg bg-info-soft px-2 py-1 text-[9px] font-semibold uppercase text-info">{event.status}</span>
    </Link>)}{!upcomingEvents.length ? <Empty label="No hay eventos próximos." /> : null}</div>
    <Link className="mt-5 flex items-center justify-center gap-2 border-t pt-4 text-xs font-semibold text-brand" href="/events">Ver todos los eventos <ArrowRight className="size-3.5" /></Link>
  </section>;

  const activity = <section data-command-card aria-labelledby="recent-activity-title" className="rounded-2xl border p-5 sm:p-6">
    <div className="flex items-center justify-between"><PanelTitle id="recent-activity-title" label="Actividad reciente" /><Link className="text-xs text-muted hover:text-brand" href="/notifications">Ver todo</Link></div>
    <div className="mt-4 space-y-4">{recentActivity.slice(0, 6).map((item, index) => <Link className="group flex items-start gap-3" href={item.href} key={item.id}><span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] ${index % 3 === 0 ? toneStyle.success : index % 3 === 1 ? toneStyle.info : toneStyle.warning}`}>•</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-muted">{item.detail}</span></span><ArrowRight className="mt-1 size-3.5 text-muted opacity-0 transition group-hover:opacity-100" /></Link>)}{!recentActivity.length ? <Empty label="Sin actividad reciente." /> : null}</div>
  </section>;

  const alerts = <section data-command-card aria-labelledby="founder-alerts-title" className="rounded-2xl border p-5 sm:p-6"><PanelTitle id="founder-alerts-title" label="Alertas y pendientes" /><div className="mt-4 grid gap-3 md:grid-cols-3">{
    [...operationalAlerts.slice(0, 2), ...finance.risks.slice(0, 3).map(risk => ({ id: risk.key, title: risk.label, detail: `${risk.count} pendientes · ${money(risk.amount)}`, href: risk.href, tone: risk.severity }))].slice(0, 3).map(alert => <Link className="group rounded-xl border bg-background/30 p-4 transition hover:border-brand/35" href={alert.href} key={alert.id}><span className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${alert.tone === "danger" ? toneStyle.danger : toneStyle.warning}`}><AlertTriangle className="size-4" /></span><span><strong className="block text-sm">{alert.title}</strong><span className="mt-1 block text-xs text-muted">{alert.detail}</span></span></span><span className="mt-3 block text-xs font-semibold text-brand">Ver detalles</span></Link>)
  }</div>{!operationalAlerts.length && !finance.risks.length ? <Empty label="No hay alertas accionables." /> : null}</section>;

  const commandGrid = <section aria-label="Jornada operacional" className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.58fr)_minmax(19rem,.92fr)]"><div className="space-y-5">{today}{alerts}</div><div className="space-y-5">{upcoming}</div></section>;

  const actions = <section aria-labelledby="quick-actions-title"><PanelTitle id="quick-actions-title" label="Acciones rápidas" /><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{quickActions.map(action => { const Icon = action.icon; return <Link data-command-card className="group flex min-h-[4.75rem] items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5" href={action.href} key={action.label}><span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="size-4" /></span><span className="text-xs font-semibold">{action.label}</span></Link>; })}</div></section>;

  const settings = <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><PanelTitle id="workspace-settings-title" label="Founder Workspace" /><p className="mt-2 text-xs text-muted">Mueve, oculta y restaura cada bloque. Tu configuración permanece guardada.</p></div><Link className="inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-xs font-semibold hover:border-brand/40 hover:text-brand" href="/settings#founder-workspace"><Settings2 className="mr-2 size-4" />Configurar espacio</Link></section>;

  const staffApprovals = staffApprovalItems.length ? <PendingStaffApprovals items={staffApprovalItems} onResolved={(id) => setResolvedApprovalIds((current) => new Set(current).add(id))} /> : null;

  return <main className="orbit-command-center" id="founder-workspace"><PersonalWorkspaceSections moduleKey="DASHBOARD" sections={[
    { key: "DASHBOARD_HEADER", label: "Bienvenida", content: welcome },
    { key: "DASHBOARD_WIDGETS", label: "KPIs del Founder", content: founderKpis },
    ...(staffApprovals ? [{ key: "DASHBOARD_STAFF_APPROVALS", label: "Aprobaciones de Staff pendientes", content: staffApprovals }] : []),
    { key: "DASHBOARD_QUICK_ACTIONS", label: "Acciones rápidas", content: actions },
    { key: "DASHBOARD_TODAY", label: "Jornada operacional", content: commandGrid },
    { key: "DASHBOARD_RECENT_ACTIVITY", label: "Actividad reciente", content: activity },
    ...(publicationConsole ? [{ key: "PUBLICATION_CONSOLE", label: "Consola de publicación", content: publicationConsole }] : []),
    { key: "DASHBOARD_WORKSPACE_SETTINGS", label: "Configuración del Workspace", content: settings },
  ]} /></main>;
}

const roleLabel: Record<string, string> = {
  OPERATOR: "Operador",
  ASSEMBLY: "Montaje",
  DISASSEMBLY: "Desmontaje",
  ASSEMBLY_DISASSEMBLY: "Montaje + Desmontaje",
};

function PendingStaffApprovals({ items, onResolved }: { items: PendingStaffApproval[]; onResolved: (id: string) => void }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!items.length) return null;
  const review = (item: PendingStaffApproval, decision: "approve" | "reject") => {
    setPendingId(item.id);
    setMessage("");
    startTransition(async () => {
      const form = new FormData();
      form.set("requestId", item.id);
      form.set("decision", decision);
      const result = await reviewStaffRequestAction(form);
      setMessage(result.message);
      if (result.ok) {
        onResolved(item.id);
        router.refresh();
      }
      setPendingId(null);
    });
  };
  return <section data-command-card aria-labelledby="pending-staff-approvals-title" className="rounded-2xl border border-brand/25 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><PanelTitle id="pending-staff-approvals-title" label="Aprobaciones de Staff pendientes"/><p className="mt-2 text-xs text-muted">Aprobar ejecuta la asignación canónica completa sin abrir Staff ni el Evento.</p></div><span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{items.length}</span></div>{message?<p aria-live="polite" className="mt-4 rounded-xl border bg-background/40 p-3 text-xs text-muted">{message}</p>:null}<div className="mt-5 space-y-3">{items.map(item=><article className="grid gap-3 rounded-xl border bg-background/30 p-4 lg:grid-cols-[1.1fr_1.1fr_.8fr_.8fr_auto] lg:items-center" key={item.id}><div><p className="text-[10px] uppercase tracking-[.12em] text-muted">Colaborador</p><p className="mt-1 text-sm font-semibold">{item.collaborator}</p></div><div><p className="text-[10px] uppercase tracking-[.12em] text-muted">Evento</p><p className="mt-1 text-sm font-semibold">{item.event}</p></div><div><p className="text-[10px] uppercase tracking-[.12em] text-muted">Rol</p><p className="mt-1 text-sm font-semibold">{roleLabel[item.role]??item.role}</p></div><div><p className="text-[10px] uppercase tracking-[.12em] text-muted">Pago estimado</p><p className="mt-1 text-sm font-semibold">{money(item.estimatedPayment)}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><button className="min-h-10 rounded-xl bg-brand px-3 text-xs font-semibold text-brand-foreground disabled:opacity-50" disabled={isPending} onClick={()=>review(item,"approve")}>{pendingId===item.id&&isPending?"Procesando…":"Aprobar"}</button><button className="min-h-10 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50" disabled={isPending} onClick={()=>review(item,"reject")}>Rechazar</button><Link className="inline-flex min-h-10 items-center rounded-xl border px-3 text-xs font-semibold text-muted hover:text-brand" href={`/projects/${item.projectId}#staff-assignment`}>Ver</Link></div></article>)}</div></section>;
}

function PanelTitle({ id, label }: { id: string; label: string }) { return <h2 data-command-label id={id}>{label}</h2>; }
function StatusPill({ tone = "info" }: { tone?: CommandCenterItem["tone"] }) { const resolved = tone ?? "info"; return <span className={`hidden rounded-lg px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.06em] sm:inline-flex ${toneStyle[resolved]}`}>{resolved === "danger" ? "Crítico" : resolved === "warning" ? "Pendiente" : "Activo"}</span>; }
function Empty({ label }: { label: string }) { return <p className="rounded-xl border border-dashed p-4 text-xs text-muted">{label}</p>; }
