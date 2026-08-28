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
  Check,
  UserRoundCheck,
  ArrowDown,
  ArrowUp,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { FinanceDashboardReadModel, FinanceMetric } from "@/features/finance/finance-read-model";
import { PersonalWorkspaceSections } from "./personal-workspace";
import { reviewStaffRequestAction } from "@/features/operations/operations-planning.actions";
import { markNotificationReadAction } from "@/features/notification-center/actions";
import { FinancialAlertCenter, type FinancialAlertView } from "@/features/financial-alerts/financial-alert-center";
import type { FounderActionItem } from "@/features/founder-action-center";
import { usePersonalWorkspace } from "./personal-workspace";
import {
  reconcileDashboardLayout,
  type DashboardLayout,
  type DashboardKpiItemKey,
  type DashboardQuickActionItemKey,
} from "./dashboard-layout";
import { saveFounderDashboardLayoutAction } from "./dashboard-layout.actions";

export type CommandCenterItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  time?: string;
  tone?: "default" | "success" | "info" | "warning" | "danger";
  acknowledgeable?: boolean;
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

const expenseQuickAction = { label: "+ Ingresar gasto", href: "/finance/expenses?create=1", icon: WalletCards } as const;
const quickActions: Array<{ id: DashboardQuickActionItemKey; label: string; href: string; icon: LucideIcon }> = [
  { id: "action.new_customer", label: "+ Nuevo cliente", href: "/customers", icon: UsersRound },
  { id: "action.new_reservation", label: "+ Nueva reserva", href: "/projects?reservation=new", icon: FilePlus2 },
  { id: "action.quote", label: "Cotizar", href: "/leads", icon: ReceiptText },
  { id: "action.new_expense", ...expenseQuickAction },
] as const;

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const formatMetric = (metric: FinanceMetric) => metric.format === "money" ? money(metric.value) : metric.format === "percent" ? `${metric.value.toFixed(1)}%` : new Intl.NumberFormat("es-CL").format(metric.value);
const formatFounderActionTimestamp = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")}-${part("month")}-${part("year").slice(-2)}, ${part("hour")}:${part("minute")}`;
};
const toneStyle = {
  default: "bg-accent text-muted",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export function FounderWorkspaceExperience({ currentDate, finance, financialAlert, financialAlertHistory, founderName, founderActions, operationalAlerts, pendingStaffApprovals, pendingTasks, publicationConsole, recentActivity, todayEvents, todayOperation, upcomingEvents }: {
  currentDate: string;
  finance: FinanceDashboardReadModel;
  financialAlert: FinancialAlertView | null;
  financialAlertHistory: FinancialAlertView[];
  founderName: string;
  founderActions: FounderActionItem[];
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
  const workspace = usePersonalWorkspace();
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>(() =>
    reconcileDashboardLayout(workspace.preferences.dashboardLayout),
  );
  const [ordering, setOrdering] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderPending, startOrderTransition] = useTransition();
  const [resolvedApprovalIds, setResolvedApprovalIds] = useState<Set<string>>(() => new Set());
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<string>>(() => new Set());
  const [alertPending, startAlertTransition] = useTransition();
  useEffect(() => {
    setDashboardLayout(
      reconcileDashboardLayout(workspace.preferences.dashboardLayout),
    );
  }, [workspace.preferences.dashboardLayout]);
  const staffApprovalItems = pendingStaffApprovals.filter((item) => !resolvedApprovalIds.has(item.id));
  const visibleOperationalAlerts = operationalAlerts.filter((item) => !acknowledgedAlertIds.has(item.id));
  const acknowledgeAlert = (id: string) => startAlertTransition(async () => {
    await markNotificationReadAction(id);
    setAcknowledgedAlertIds((current) => new Set(current).add(id));
    router.refresh();
  });
  const position = (label: string) => finance.position.find(item => item.label === label);
  const month = (label: string) => finance.month.find(item => item.label === label);
  const fallback = (label: string, href: string): FinanceMetric => ({ label, value: 0, format: "money", detail: "Sin movimientos canónicos.", href });
  const kpis: Array<{ id: DashboardKpiItemKey; metric: FinanceMetric; icon: LucideIcon; tone: keyof typeof toneStyle }> = [
    { id: "kpi.cash_registered", metric: position("Caja registrada") ?? fallback("Caja registrada", "/finance/cash-flow"), icon: WalletCards, tone: "info" },
    { id: "kpi.total_receivables", metric: position("Por cobrar total") ?? fallback("Por cobrar total", "/finance/receivables"), icon: CircleDollarSign, tone: "warning" },
    { id: "kpi.company_credit", metric: position("Crédito Empresas") ?? fallback("Crédito Empresas", "/finance/receivables?category=company-credit"), icon: CircleDollarSign, tone: "warning" },
    { id: "kpi.customer_balances", metric: position("Saldos Clientes / Eventos") ?? fallback("Saldos Clientes / Eventos", "/finance/receivables?category=ordinary"), icon: WalletCards, tone: "info" },
    { id: "kpi.month_sales", metric: month("Ventas del mes") ?? fallback("Ventas del mes", "/projects?period=month"), icon: TrendingUp, tone: "success" },
    { id: "kpi.operating_result", metric: month("Resultado operativo") ?? fallback("Resultado operativo del mes", "/finance/expenses"), icon: TrendingUp, tone: "success" },
    { id: "kpi.operating_margin", metric: month("Margen operativo") ?? { label: "Margen operativo del mes", value: 0, format: "percent", detail: "Resultado operativo sobre ventas del mes.", href: "/finance/expenses" }, icon: TrendingUp, tone: "info" },
    { id: "kpi.events_today", metric: { label: "Eventos hoy", value: todayEvents, format: "count", detail: "Agenda operacional de hoy.", href: "/projects?date=today" }, icon: CalendarDays, tone: "default" },
  ];

  const saveOrder = (next: DashboardLayout) => {
    setDashboardLayout(next);
    setOrderMessage("Guardando…");
    startOrderTransition(async () => {
      const result = await saveFounderDashboardLayoutAction(next);
      setOrderMessage(result.ok ? "✓ Orden guardado" : result.error);
    });
  };

  const move = (
    zone: "kpiOrder" | "quickActionOrder",
    id: DashboardKpiItemKey | DashboardQuickActionItemKey,
    direction: -1 | 1,
  ) => {
    const order = [...dashboardLayout[zone]] as string[];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    saveOrder({ ...dashboardLayout, [zone]: order } as DashboardLayout);
  };

  const moveCalendar = (direction: -1 | 1) => {
    const config = workspace.preferences.moduleWorkspaces.DASHBOARD;
    if (!config) return;
    const order = [...config.sectionOrder];
    const index = order.indexOf("DASHBOARD_UPCOMING_EVENTS");
    const visibleOrder = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-workspace-block][data-workspace-key]',
      ),
    ]
      .map((element) => element.dataset.workspaceKey ?? "")
      .filter(Boolean);
    const visibleIndex = visibleOrder.indexOf("DASHBOARD_UPCOMING_EVENTS");
    const targetKey = visibleOrder[visibleIndex + direction];
    const target = order.indexOf(targetKey);
    if (index < 0 || visibleIndex < 0 || target < 1) return;
    [order[index], order[target]] = [order[target], order[index]];
    setOrderMessage("Guardando…");
    startOrderTransition(async () => {
      const result = await workspace.update({
        ...workspace.preferences,
        moduleWorkspaces: {
          ...workspace.preferences.moduleWorkspaces,
          DASHBOARD: { ...config, sectionOrder: order },
        },
      });
      const saved = Boolean(
        result && typeof result === "object" && "ok" in result && result.ok,
      );
      setOrderMessage(saved ? "✓ Orden guardado" : "No fue posible guardar el orden.");
    });
  };

  const orderedKpis = dashboardLayout.kpiOrder
    .map((id) => kpis.find((item) => item.id === id))
    .filter((item): item is (typeof kpis)[number] => Boolean(item));
  const orderedQuickActions = dashboardLayout.quickActionOrder
    .map((id) => quickActions.find((item) => item.id === id))
    .filter((item): item is (typeof quickActions)[number] => Boolean(item));

  const welcome = <header className="pb-1 pt-2 sm:pb-2 sm:pt-4">
    <p data-command-label>Founder Command Center</p>
    <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-.05em] sm:text-[2.6rem]">Buenos días, {founderName} <span aria-hidden>👋</span></h1>
    <p className="mt-2 text-sm capitalize text-muted">{currentDate}</p>
    <p className="mt-4 text-sm text-muted">{todayEvents} eventos hoy <span className="px-1.5 text-border">·</span> {pendingTasks} prioridades pendientes</p>
    <span className="mt-4 flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand/30 px-4 text-sm font-semibold text-brand" href={expenseQuickAction.href}><WalletCards className="size-4" />{expenseQuickAction.label}</Link><button aria-pressed={ordering} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-muted transition hover:border-brand/40 hover:text-brand" onClick={() => { setOrdering((value) => !value); setOrderMessage(""); }} type="button"><GripVertical className="size-4" />{ordering ? "Terminar" : "Ordenar escritorio"}</button></span>
    {ordering || orderMessage ? <p aria-live="polite" className="mt-2 text-xs text-muted">{orderPending ? "Guardando…" : orderMessage || "Usa las flechas para cambiar el orden."}</p> : null}
  </header>;

  const founderKpis = <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {orderedKpis.map(({ id, metric, icon: Icon, tone }, index) => <OrderableItem controls={ordering ? <OrderControls disableDown={index === orderedKpis.length - 1} disableUp={index === 0} label={metric.label} onDown={() => move("kpiOrder", id, 1)} onUp={() => move("kpiOrder", id, -1)} /> : null} key={id}><button data-command-card className="group min-h-[7.75rem] min-w-0 w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 sm:p-[1.05rem]" onClick={() => router.push(metric.href)} style={{ containerType: "inline-size" }}>
      <span className="flex items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneStyle[tone]}`}><Icon className="size-[18px]" /></span><span className="text-[.7rem] font-medium leading-4 text-muted">{metric.label}</span></span>
      <FounderKpiValue>{formatMetric(metric)}</FounderKpiValue>
      <span className="mt-2 block truncate text-[10px] text-muted">{metric.detail}</span>
    </button></OrderableItem>)}
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

  const actionCenter = <section data-command-card aria-labelledby="founder-action-center-title" className="rounded-2xl border border-brand/35 bg-brand/[.035] p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p data-command-label>Alertas del Founder</p><h2 className="mt-1 text-xl font-semibold" id="founder-action-center-title">Pendientes por revisar</h2><p className="mt-2 text-xs text-muted">Tareas que permanecen aquí hasta que su estado canónico quede resuelto.</p></div><span aria-label={`${founderActions.length} pendientes accionables`} className="grid min-h-11 min-w-11 place-items-center rounded-full bg-brand px-3 text-lg font-bold text-brand-foreground">{founderActions.length}</span></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{founderActions.map(item=>{const Icon=item.type==="STAFF_ONBOARDING_REVIEW_REQUIRED"?UserRoundCheck:item.type==="OVERDUE_INVOICE_GROUP"?CircleDollarSign:ReceiptText;return <article className="min-w-0 rounded-xl border bg-card p-4" key={item.id}><div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.priority==="P0"?toneStyle.danger:toneStyle.warning}`}><Icon className="size-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em]">{item.priority}</span><span className="text-[10px] font-semibold uppercase text-muted">{item.category}</span>{item.read?<span className="text-[10px] text-muted">Leída · pendiente</span>:null}</div><h3 className="mt-2 text-sm font-semibold">{item.title}</h3><p className="mt-1 break-words text-xs leading-5 text-muted">{item.detail}</p><p className="mt-2 text-[10px] text-muted">{formatFounderActionTimestamp(item.createdAt)}</p></div></div><Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-center text-xs font-bold text-background sm:w-auto" href={item.href}>{item.cta}<ArrowRight className="size-3.5"/></Link></article>})}</div>
    {!founderActions.length?<Empty label="No hay decisiones pendientes del Founder."/>:null}
  </section>;

  const upcoming = <section data-command-card aria-labelledby="upcoming-events-title" className="rounded-2xl border p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><PanelTitle id="upcoming-events-title" label="Próximos eventos" /><Link className="text-xs text-muted transition hover:text-brand" href="/events">Ver calendario</Link></div>
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

  const alertItems: CommandCenterItem[] = [
    ...visibleOperationalAlerts.slice(0, 2),
    ...finance.risks.slice(0, 3).map((risk) => ({
      id: risk.key,
      title: risk.label,
      detail: `${risk.count} pendientes · ${money(risk.amount)}`,
      href: risk.href,
      tone: risk.severity,
      acknowledgeable: false,
    })),
  ].slice(0, 3);
  const alerts = <section data-command-card aria-labelledby="founder-alerts-title" className="rounded-2xl border p-5 sm:p-6"><PanelTitle id="founder-alerts-title" label="Alertas y pendientes" /><div className="mt-4 grid gap-3 md:grid-cols-3">{
    alertItems.map(alert => <article className="rounded-xl border bg-background/30 p-4 transition hover:border-brand/35" key={alert.id}><span className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${alert.tone === "danger" ? toneStyle.danger : toneStyle.warning}`}><AlertTriangle className="size-4" /></span><span><strong className="block text-sm">{alert.title}</strong><span className="mt-1 block text-xs text-muted">{alert.detail}</span></span></span><span className="mt-3 flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-9 items-center rounded-lg border border-brand/25 px-3 text-xs font-semibold text-brand" href={alert.href}>{alert.acknowledgeable ? "Abrir Evento / Cobertura Staff" : "Ver detalles"}</Link>{alert.acknowledgeable ? <button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50" disabled={alertPending} onClick={() => acknowledgeAlert(alert.id)}><Check className="size-3.5" />OK, visto</button> : null}</span></article>)
  }</div>{!visibleOperationalAlerts.length && !finance.risks.length ? <Empty label="No hay alertas accionables." /> : null}</section>;

  const commandGrid = <section aria-label="Jornada operacional" className="space-y-5">{actionCenter}<div className="space-y-5">{today}{alerts}</div></section>;

  const actions = <section aria-labelledby="quick-actions-title"><PanelTitle id="quick-actions-title" label="Acciones rápidas" /><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{orderedQuickActions.map((action, index) => { const Icon = action.icon; return <OrderableItem controls={ordering ? <OrderControls disableDown={index === orderedQuickActions.length - 1} disableUp={index === 0} label={action.label} onDown={() => move("quickActionOrder", action.id, 1)} onUp={() => move("quickActionOrder", action.id, -1)} /> : null} key={action.id}><Link data-command-card className="group flex min-h-[4.75rem] items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5" href={action.href}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="size-4" /></span><span className="text-xs font-semibold uppercase">{action.label}</span></Link></OrderableItem>; })}</div></section>;

  const settings = <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><PanelTitle id="workspace-settings-title" label="Founder Workspace" /><p className="mt-2 text-xs text-muted">Mueve, oculta y restaura cada bloque. Tu configuración permanece guardada.</p></div><Link className="inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-xs font-semibold hover:border-brand/40 hover:text-brand" href="/settings#founder-workspace"><Settings2 className="mr-2 size-4" />Configurar espacio</Link></section>;

  const staffApprovals = staffApprovalItems.length ? <PendingStaffApprovals items={staffApprovalItems} onResolved={(id) => setResolvedApprovalIds((current) => new Set(current).add(id))} /> : null;
  const financialAlerts = financialAlert || financialAlertHistory.length ? <FinancialAlertCenter current={financialAlert} history={financialAlertHistory} /> : null;
  const dashboardSections = workspace.preferences.moduleWorkspaces.DASHBOARD?.sectionOrder ?? [];
  const calendarIndex = dashboardSections.indexOf("DASHBOARD_UPCOMING_EVENTS");
  const calendarSection = <OrderableItem controls={ordering ? <OrderControls avoidWorkspaceMenu disableDown={calendarIndex < 0 || calendarIndex === dashboardSections.length - 1} disableUp={calendarIndex <= 1} label="Próximos eventos" onDown={() => moveCalendar(1)} onUp={() => moveCalendar(-1)} /> : null}>{upcoming}</OrderableItem>;

  return <main className="orbit-command-center" id="founder-workspace"><PersonalWorkspaceSections moduleKey="DASHBOARD" reorderEnabled={ordering} sections={[
    { key: "DASHBOARD_HEADER", label: "Bienvenida", content: welcome },
    { key: "DASHBOARD_UPCOMING_EVENTS", label: "Próximos eventos", content: calendarSection },
    { key: "DASHBOARD_WIDGETS", label: "KPIs del Founder", content: founderKpis },
    ...(financialAlerts ? [{ key: "DASHBOARD_FINANCIAL_ALERTS", label: "Obligaciones financieras", content: financialAlerts }] : []),
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
export function FounderKpiValue({ children }: { children: string }) { return <strong data-kpi-value className="orbit-counter mt-3 block max-w-full min-w-0 whitespace-nowrap font-semibold leading-[1.05] tracking-[-.05em] [font-variant-numeric:tabular-nums]" style={{ fontSize: "clamp(1.05rem, 1.6vw, 1.5rem)" }}>{children}</strong>; }
function OrderableItem({ children, controls }: { children: ReactNode; controls: ReactNode }) { return controls ? <div className="relative min-w-0 rounded-2xl ring-1 ring-brand/50">{children}{controls}</div> : <>{children}</>; }
function OrderControls({ avoidWorkspaceMenu = false, disableDown, disableUp, label, onDown, onUp }: { avoidWorkspaceMenu?: boolean; disableDown: boolean; disableUp: boolean; label: string; onDown: () => void; onUp: () => void }) { return <span className={`absolute top-2 flex gap-1 rounded-lg border bg-card/95 p-1 shadow-sm ${avoidWorkspaceMenu ? "right-14 z-40" : "right-2 z-10"}`}><button aria-label={`Mover arriba ${label}`} className="grid size-9 place-items-center rounded-md text-muted hover:bg-accent hover:text-brand disabled:opacity-30" disabled={disableUp} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onUp(); }} type="button"><ArrowUp className="size-4" /></button><button aria-label={`Mover abajo ${label}`} className="grid size-9 place-items-center rounded-md text-muted hover:bg-accent hover:text-brand disabled:opacity-30" disabled={disableDown} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDown(); }} type="button"><ArrowDown className="size-4" /></button></span>; }
function StatusPill({ tone = "info" }: { tone?: CommandCenterItem["tone"] }) { const resolved = tone ?? "info"; return <span className={`hidden rounded-lg px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.06em] sm:inline-flex ${toneStyle[resolved]}`}>{resolved === "danger" ? "Crítico" : resolved === "warning" ? "Pendiente" : "Activo"}</span>; }
function Empty({ label }: { label: string }) { return <p className="rounded-xl border border-dashed p-4 text-xs text-muted">{label}</p>; }
