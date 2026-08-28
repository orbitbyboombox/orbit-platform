"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Cloud,
  FilePlus2,
  FolderPlus,
  Mail,
  MapPin,
  Sparkles,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiveExpenseCapture } from "@/features/expense-capture";
import {
  ORBIT_TIME_ENGINE,
  type CountdownVisualState,
} from "@/features/time-intelligence";
import { reviewStaffRequestAction } from "@/features/operations/operations-planning.actions";
import { usePersonalWorkspace } from "./personal-workspace";
import {
  DashboardLayoutEditor,
  type DashboardLayoutItem,
} from "./dashboard-layout-editor";
import { FinancialAlertCenter, type FinancialAlertView } from "@/features/financial-alerts/financial-alert-center";
import type { FounderActionItem } from "@/features/founder-action-center";
import { DEFAULT_DASHBOARD_LAYOUT } from "./dashboard-layout";

const COUNTDOWN_VARIANT: Record<
  CountdownVisualState,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  GREEN: "success",
  YELLOW: "warning",
  ORANGE: "warning",
  RED: "danger",
  PRIMARY: "info",
  COMPLETED: "neutral",
  ARCHIVED: "neutral",
};

const toneStyle = {
  default: "bg-accent text-muted",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

const executiveServices = [
  {
    label: "Workspace",
    status: "Operativo",
    icon: Check,
    variant: "success" as const,
  },
  {
    label: "Calendar",
    status: "Conexión pendiente",
    icon: CalendarDays,
    variant: "warning" as const,
  },
  {
    label: "Drive",
    status: "Conexión pendiente",
    icon: Cloud,
    variant: "warning" as const,
  },
  {
    label: "Gmail",
    status: "Conexión pendiente",
    icon: Mail,
    variant: "warning" as const,
  },
  {
    label: "NOVA",
    status: "Disponible",
    icon: Sparkles,
    variant: "success" as const,
  },
] as const;

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
  client?: string;
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

export function FounderWorkspaceExperience({
  currentDate,
  finance,
  financialAlert,
  financialAlertHistory,
  founderName,
  founderActions,
  operationalAlerts,
  pendingStaffApprovals,
  pendingTasks,
  publicationConsole,
  recentActivity,
  todayEvents,
  todayOperation,
  upcomingEvents,
}: {
  currentDate: string;
  finance: {
    generatedAt: string;
    periodLabel: string;
    cash: {
      total: number;
      unassigned: number;
      accounts: { label: string; value: number; href: string }[];
    };
    today: { label: string; value: number; format: "money" | "percent" | "count"; detail: string; href: string; tone?: "default" | "success" | "warning" | "danger" }[];
    month: { label: string; value: number; format: "money" | "percent" | "count"; detail: string; href: string; tone?: "default" | "success" | "warning" | "danger" }[];
    position: { label: string; value: number; format: "money" | "percent" | "count"; detail: string; href: string; tone?: "default" | "success" | "warning" | "danger" }[];
    forecast: { label: string; value: number; format: "money" | "percent" | "count"; detail: string; href: string; tone?: "default" | "success" | "warning" | "danger" }[];
    risks: { key: string; label: string; count: number; amount: number; detail: string; href: string; severity: "warning" | "danger" }[];
  };
  financialAlert: FinancialAlertView | null;
  financialAlertHistory: FinancialAlertView[];
  founderName: string;
  founderActions: FounderActionItem[];
  operationalAlerts: CommandCenterItem[];
  pendingStaffApprovals: PendingStaffApproval[];
  pendingTasks: number;
  publicationConsole?: ReactNode;
  recentActivity: CommandCenterItem[];
  todayEvents: number;
  todayOperation: CommandCenterItem[];
  upcomingEvents: CommandCenterEvent[];
}) {
  const router = useRouter();
  const workspace = usePersonalWorkspace();
  const [expenseCaptureOpen, setExpenseCaptureOpen] = useState(false);
  const timeContext = ORBIT_TIME_ENGINE.getCurrentContext(founderName);
  const nextEvent = useMemo(() => {
    const agendaEvents = upcomingEvents;
    return (
      agendaEvents.find(
        (event) =>
          ORBIT_TIME_ENGINE.getCountdown({ eventDate: event.date }).state ===
          "FUTURE",
      ) ?? agendaEvents[0] ?? null
    );
  }, [upcomingEvents]);
  const hasEvents = Boolean(nextEvent);
  const nextEventIntelligence = nextEvent
    ? ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: nextEvent.date })
    : null;
  const critical = finance.risks.filter((risk) => risk.severity === "danger").length;
  const pending = finance.risks.filter((risk) => risk.severity === "warning").length;
  const actionCenterItems = founderActions.length;

  const openProject = (id?: string | null) => {
    if (!id) {
      router.push("/projects");
      return;
    }
    router.push(`/projects/${id}`);
  };

  const kpis: DashboardLayoutItem[] = [
    metricItem("kpi.cash_registered", finance.position, "Caja registrada", router),
    metricItem(
      "kpi.total_receivables",
      finance.position,
      "Por cobrar total",
      router,
    ),
    metricItem(
      "kpi.company_credit",
      finance.position,
      "Crédito Empresas",
      router,
    ),
    metricItem(
      "kpi.customer_balances",
      finance.position,
      "Saldos Clientes / Eventos",
      router,
    ),
    metricItem("kpi.month_sales", finance.month, "Ventas del mes", router),
    metricItem(
      "kpi.operating_result",
      finance.month,
      "Resultado operativo",
      router,
    ),
    metricItem(
      "kpi.operating_margin",
      finance.month,
      "Margen operativo",
      router,
    ),
    {
      id: "kpi.events_today",
      label: "Eventos hoy",
      content: (
        <button
          className="group min-h-[7.75rem] min-w-0 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 sm:p-[1.05rem]"
          onClick={() => router.push("/projects?date=today")}
          style={{ containerType: "inline-size" }}
          type="button"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-muted">
              <CalendarDays className="size-[18px]" />
            </span>
            <span className="text-[.7rem] font-medium leading-4 text-muted">
              Eventos hoy
            </span>
          </span>
          <FounderKpiValue>{new Intl.NumberFormat("es-CL").format(todayEvents)}</FounderKpiValue>
          <span className="mt-2 block truncate text-[10px] text-muted">
            Agenda operacional de hoy.
          </span>
        </button>
      ),
      className: "h-full",
    },
  ];

  const quickActions: DashboardLayoutItem[] = [
    {
      id: "action.new_customer",
      label: "Nuevo Cliente",
      content: quickActionCard(
        "Nuevo Cliente",
        UserRound,
        "/customers",
        "Abrir CRM",
      ),
    },
    {
      id: "action.new_reservation",
      label: "Nueva Reserva",
      content: quickActionCard(
        "Nueva Reserva",
        FolderPlus,
        "/projects?reservation=new",
        "Crear reserva",
      ),
    },
    {
      id: "action.quote",
      label: "Cotizar",
      content: quickActionCard("Cotizar", FilePlus2, "/leads", "Abrir cotización"),
    },
    {
      id: "action.new_expense",
      label: "Ingresar Gasto",
      content: quickActionCard(
        "Ingresar Gasto",
        Camera,
        "/finance/expenses?create=1",
        "Registrar gasto",
      ),
    },
  ];

  const widgets: DashboardLayoutItem[] = [
    ...(financialAlert || financialAlertHistory.length
      ? [
          {
            id: "widget.financial_alerts",
            label: "Obligaciones financieras",
            content: (
              <FinancialAlertCenter
                current={financialAlert}
                history={financialAlertHistory}
              />
            ),
          } as DashboardLayoutItem,
        ]
      : []),
    ...(pendingStaffApprovals.length
      ? [
          {
            id: "widget.staff_approvals",
            label: "Aprobaciones de Staff pendientes",
            content: (
              <PendingStaffApprovals items={pendingStaffApprovals} />
            ),
          } as DashboardLayoutItem,
        ]
      : []),
    {
      id: "widget.action_center",
      label: "Centro de decisiones",
      content: (
        <SmartCard icon={<AlertTriangle aria-hidden="true" className="size-5" />} title="Centro de decisiones">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                label: "Críticas",
                value: critical.toString(),
                detail: "Resolver ahora",
                variant: "danger" as const,
              },
              {
                label: "Requieren atención",
                value: pending.toString(),
                detail: "Revisar hoy",
                variant: "warning" as const,
              },
              {
                label: "Prioridades activas",
                value: actionCenterItems.toString(),
                detail: "Ver alertas",
                variant: "success" as const,
              },
            ].map((decision) => (
              <Button
                className="h-auto justify-between rounded-xl px-4 py-4 text-left"
                key={decision.label}
                onClick={() => router.push("/operations")}
                variant="outline"
              >
                <span>
                  <span className="block text-xs text-muted">{decision.label}</span>
                  <span className="mt-1 block text-2xl font-semibold">
                    {decision.value}
                  </span>
                  <span className="mt-2 block text-xs text-muted">
                    {decision.detail}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            ))}
          </div>
        </SmartCard>
      ),
    },
    {
      id: "widget.today_operation",
      label: "Jornada operacional",
      content: (
        <SmartCard icon={<Check aria-hidden="true" className="size-5" />} title="Estado ejecutivo">
          <div className="divide-y divide-border/70">
            {executiveServices.map(({ label, status, icon: Icon, variant }) => (
              <div
                className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                key={label}
              >
                <span className="flex items-center gap-2 text-sm">
                  <Icon aria-hidden="true" className="size-4 text-muted" />
                  {label}
                </span>
                <StatusBadge label={status} variant={variant} />
              </div>
            ))}
          </div>
        </SmartCard>
      ),
    },
    {
      id: "widget.upcoming_events",
      label: "Próximos eventos",
      content: (
        <SmartCard
          actionLabel="Abrir evento"
          icon={<CalendarClock aria-hidden="true" className="size-5" />}
          onAction={() => openProject(nextEvent?.id)}
          primaryValue={nextEvent?.client ?? nextEvent?.title ?? "Sin eventos confirmados"}
          secondaryValue={
            nextEvent
              ? `${nextEvent.service} · ${nextEvent.time}`
              : "Cuando confirmes un proyecto aparecerá aquí."
          }
          status={
            nextEventIntelligence ? (
              <StatusBadge
                label={nextEventIntelligence.countdown.label}
                variant={
                  COUNTDOWN_VARIANT[
                    nextEventIntelligence.countdown.visualState
                  ]
                }
              />
            ) : (
              <StatusBadge label="Sin eventos" variant="neutral" />
            )
          }
          title="Próximo evento"
        >
          {nextEvent ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Ubicación</dt>
                <dd className="mt-1 font-semibold">{nextEvent.location}</dd>
              </div>
              <div>
                <dt className="text-muted">Fase operacional</dt>
                <dd className="mt-1 font-semibold">
                  {nextEventIntelligence?.timeline.phaseLabel ?? "Sin fase"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Próxima acción</dt>
                <dd className="mt-1 font-semibold text-brand">
                  {nextEventIntelligence?.timeline.nextAction ?? "Sin acción"}
                </dd>
              </div>
            </dl>
          ) : null}
        </SmartCard>
      ),
    },
    {
      id: "widget.recent_activity",
      label: "Actividad reciente",
      content: (
        <SmartCard icon={<Sparkles aria-hidden="true" className="size-5" />} title="Actividad reciente">
          <div className="space-y-4">
            {recentActivity.slice(0, 6).map((item, index) => (
              <a className="group flex items-start gap-3" href={item.href} key={item.id}>
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] ${
                    index % 3 === 0
                      ? toneStyle.success
                      : index % 3 === 1
                        ? toneStyle.info
                        : toneStyle.warning
                  }`}
                >
                  •
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-medium">
                    {item.title}
                  </strong>
                  <span className="mt-1 block truncate text-[11px] text-muted">
                    {item.detail}
                  </span>
                </span>
                <ArrowRight className="mt-1 size-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
              </a>
            ))}
            {recentActivity.length === 0 ? (
              <EmptyState label="Sin actividad reciente." />
            ) : null}
          </div>
        </SmartCard>
      ),
    },
    {
      id: "widget.publication_console",
      label: "Consola de publicación",
      content: publicationConsole ? (
        <div>{publicationConsole}</div>
      ) : (
        <EmptyState label="La consola de publicación no está disponible." />
      ),
    },
    {
      id: "widget.workspace_settings",
      label: "Configuración del Workspace",
      content: (
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <PanelTitle id="workspace-settings-title" label="Founder Workspace" />
            <p className="mt-2 text-xs text-muted">
              Mueve, oculta y restaura cada bloque. Tu configuración permanece
              guardada.
            </p>
          </div>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-xs font-semibold hover:border-brand/40 hover:text-brand"
            href="/settings#founder-workspace"
          >
            <Settings2 className="mr-2 size-4" />
            Configurar espacio
          </a>
        </section>
      ),
    },
  ];

  const staffApprovals = pendingStaffApprovals.length ? (
    <PendingStaffApprovals items={pendingStaffApprovals} />
  ) : null;
  const financialAlerts = financialAlert || financialAlertHistory.length ? (
    <FinancialAlertCenter current={financialAlert} history={financialAlertHistory} />
  ) : null;

  const widgetItems = widgets.filter((item) => {
    if (item.id === "widget.financial_alerts") return Boolean(financialAlerts);
    if (item.id === "widget.staff_approvals") return Boolean(staffApprovals);
    if (item.id === "widget.publication_console") return Boolean(publicationConsole);
    return true;
  });

  return (
    <main className="orbit-command-center space-y-8" id="founder-workspace">
      <section className="relative overflow-hidden rounded-[2rem] border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-24 size-72 rounded-full bg-brand/5 blur-3xl"
        />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{timeContext.formattedDate}</span>
              <span aria-hidden="true">·</span>
              <span>{timeContext.localTime}</span>
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">
              {timeContext.greetingText}
            </h1>
            <p className="mt-3 text-lg font-medium text-foreground/90 sm:text-xl">
              {hasEvents ? "Tu operación está actualizada." : "Aún no hay eventos confirmados."}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              {hasEvents
                ? "Revisa la siguiente decisión antes del próximo evento."
                : "Crea o confirma un proyecto para comenzar la planificación."}
            </p>
          </div>
          <ActionButton
            className="min-h-12 w-full px-6 sm:w-auto"
            icon={ArrowRight}
            iconPosition="end"
            label="Revisar prioridades"
            onClick={() =>
              document.getElementById("dashboard-kpis")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          />
        </div>
        <dl className="relative mt-8 grid grid-cols-2 gap-x-5 gap-y-5 border-t pt-6 lg:grid-cols-4">
          {[
            { value: todayEvents.toString(), label: "eventos hoy" },
            { value: critical.toString(), label: "decisiones críticas" },
            { value: pending.toString(), label: "aprobaciones pendientes" },
            {
              value: pendingTasks.toString(),
              label: "tareas operativas",
            },
          ].map((item) => (
            <div key={item.label}>
              <dd className="text-2xl font-semibold tracking-tight">
                {item.value}
              </dd>
              <dt className="mt-1 text-xs text-muted sm:text-sm">{item.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section id="dashboard-kpis">
        <DashboardLayoutEditor
          kpis={kpis}
          layout={
            workspace.preferences.dashboardLayout ??
            structuredClone(DEFAULT_DASHBOARD_LAYOUT)
          }
          quickActions={quickActions}
          widgets={widgetItems}
        />
      </section>

      <section className="rounded-[2rem] border bg-card p-5 sm:p-6" aria-label="Agenda ejecutiva">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Agenda
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Próximos movimientos
            </h2>
          </div>
          <Button onClick={() => router.push("/operations")} variant="ghost">
            Ver operación <ChevronRight aria-hidden="true" className="ml-1 size-4" />
          </Button>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {upcomingEvents.slice(0, 3).map((event, index) => {
            const intelligence = ORBIT_TIME_ENGINE.getEventIntelligence({
              eventDate: event.date,
            });
            return (
              <button
                className="grid w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-accent/50 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                key={event.id}
                onClick={() => openProject(event.id)}
                type="button"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {index === 0 ? "Próximo" : index === 1 ? "Siguiente" : "Futuro"}
                  </p>
                  <p className="mt-1 text-sm font-medium">{event.time}</p>
                </div>
                <div>
                  <p className="font-semibold">{event.client ?? event.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <MapPin aria-hidden="true" className="size-3.5" />
                    {event.location} · {event.service}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge
                    label={intelligence.countdown.label}
                    variant={
                      COUNTDOWN_VARIANT[intelligence.countdown.visualState]
                    }
                  />
                  <ChevronRight aria-hidden="true" className="size-4 text-muted" />
                </div>
              </button>
            );
          })}
          {!upcomingEvents.length ? (
            <div className="px-6 py-10 text-center">
              <p className="font-medium">Aún no hay eventos confirmados.</p>
              <p className="mt-2 text-sm text-muted">
                Los próximos eventos aparecerán aquí después de su confirmación.
              </p>
              <ActionButton
                className="mt-5"
                label="Abrir clientes"
                onClick={() => router.push("/projects")}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section aria-label="NOVA Executive Copilot">
        {hasEvents && nextEventIntelligence ? (
          <OrbitCopilot
            actionLabel={nextEventIntelligence.timeline.nextAction}
            ariaLabel="Recomendación ejecutiva de NOVA"
            estimatedTime="30 segundos"
            impact="Mantiene el proyecto dentro de su fase operacional."
            onAction={() => openProject(nextEvent?.id)}
            reason={`El proyecto ${nextEvent?.client ?? nextEvent?.title ?? "seleccionado"} requiere continuar con su siguiente etapa.`}
            recommendation={nextEventIntelligence.timeline.nextAction}
            title="NOVA · Recomendación ejecutiva"
          />
        ) : null}
      </section>

      <section className="border-t pt-7" aria-labelledby="acciones-rapidas">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Acciones rápidas
          </p>
          <h2 className="sr-only" id="acciones-rapidas">
            Acciones rápidas
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionButton
            className="min-h-12"
            icon={Camera}
            label="Sube tu gasto aquí"
            onClick={() => setExpenseCaptureOpen(true)}
          />
          <ActionButton
            icon={FolderPlus}
            label="Nueva reserva"
            onClick={() => router.push("/projects?reservation=new")}
            variant="outline"
          />
          <ActionButton
            icon={FilePlus2}
            label="Cotizar"
            onClick={() => router.push("/leads")}
            variant="outline"
          />
          <ActionButton
            icon={UserRound}
            label="Buscar cliente"
            onClick={() => router.push("/customers")}
            variant="outline"
          />
        </div>
        <LiveExpenseCapture
          onClose={() => setExpenseCaptureOpen(false)}
          open={expenseCaptureOpen}
        />
      </section>
    </main>
  );
}

function PanelTitle({ id, label }: { id: string; label: string }) {
  return (
    <h2 data-command-label id={id}>
      {label}
    </h2>
  );
}

export function FounderKpiValue({ children }: { children: string }) {
  return (
    <strong
      className="orbit-counter mt-3 block max-w-full min-w-0 font-semibold leading-[1.05] tracking-[-.05em] [font-variant-numeric:tabular-nums] [overflow-wrap:anywhere]"
      data-kpi-value
      style={{ fontSize: "clamp(.875rem, 10cqi, 1.55rem)" }}
    >
      {children}
    </strong>
  );
}

function quickActionCard(
  label: string,
  Icon: LucideIcon,
  href: string,
  detail: string,
) {
  return (
    <a
      className="group flex min-h-[4.75rem] items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5"
      href={href}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase">{label}</span>
        <span className="mt-1 block text-[11px] text-muted">{detail}</span>
      </span>
    </a>
  );
}

function metricItem(
  id: DashboardLayoutItem["id"],
  metrics:
    | {
        label: string;
        value: number;
        format: "money" | "percent" | "count";
        detail: string;
        href: string;
        tone?: "default" | "success" | "warning" | "danger";
      }[],
  label: string,
  router: ReturnType<typeof useRouter>,
): DashboardLayoutItem {
  const metric = metrics.find((item) => item.label === label) ?? {
    label,
    value: 0,
    format: "money" as const,
    detail: "Sin movimientos canónicos.",
    href: "/operations",
  };
  const MetricIcon =
    label === "Eventos hoy"
      ? CalendarDays
      : label === "Resultado operativo" || label === "Margen operativo"
        ? Check
        : CircleAlert;
  const formatValue = () => {
    if (metric.format === "percent") return `${metric.value.toFixed(1)}%`;
    if (metric.format === "count") return new Intl.NumberFormat("es-CL").format(metric.value);
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(metric.value);
  };
  return {
    id,
    label,
    content: (
      <button
        className="group min-h-[7.75rem] min-w-0 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 sm:p-[1.05rem]"
        onClick={() => router.push(metric.href)}
        style={{ containerType: "inline-size" }}
        type="button"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-muted">
            <MetricIcon className="size-[18px]" />
          </span>
          <span className="text-[.7rem] font-medium leading-4 text-muted">
            {metric.label}
          </span>
        </span>
        <FounderKpiValue>{formatValue()}</FounderKpiValue>
        <span className="mt-2 block truncate text-[10px] text-muted">
          {metric.detail}
        </span>
      </button>
    ),
    className: "h-full",
  };
}

function PendingStaffApprovals({
  items,
}: {
  items: PendingStaffApproval[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!items.length) return null;
  const review = (
    item: PendingStaffApproval,
    decision: "approve" | "reject",
  ) => {
    setPendingId(item.id);
    setMessage("");
    startTransition(async () => {
      const form = new FormData();
      form.set("requestId", item.id);
      form.set("decision", decision);
      const result = await reviewStaffRequestAction(form);
      setMessage(result.message);
      if (result.ok) {
        router.refresh();
      }
      setPendingId(null);
    });
  };
  return (
    <section
      className="rounded-2xl border border-brand/25 p-5 sm:p-6"
      data-command-card
      aria-labelledby="pending-staff-approvals-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <PanelTitle
            id="pending-staff-approvals-title"
            label="Aprobaciones de Staff pendientes"
          />
          <p className="mt-2 text-xs text-muted">
            Aprobar ejecuta la asignación canónica completa sin abrir Staff ni
            el Evento.
          </p>
        </div>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          {items.length}
        </span>
      </div>
      {message ? (
        <p aria-live="polite" className="mt-4 rounded-xl border bg-background/40 p-3 text-xs text-muted">
          {message}
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <article
            className="grid gap-3 rounded-xl border bg-background/30 p-4 lg:grid-cols-[1.1fr_1.1fr_.8fr_.8fr_auto] lg:items-center"
            key={item.id}
          >
            <div>
              <p className="text-[10px] uppercase tracking-[.12em] text-muted">
                Colaborador
              </p>
              <p className="mt-1 text-sm font-semibold">{item.collaborator}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[.12em] text-muted">
                Evento
              </p>
              <p className="mt-1 text-sm font-semibold">{item.event}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[.12em] text-muted">
                Rol
              </p>
              <p className="mt-1 text-sm font-semibold">{item.role}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[.12em] text-muted">
                Pago estimado
              </p>
              <p className="mt-1 text-sm font-semibold">
                {new Intl.NumberFormat("es-CL", {
                  style: "currency",
                  currency: "CLP",
                  maximumFractionDigits: 0,
                }).format(item.estimatedPayment)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                className="min-h-10 rounded-xl bg-brand px-3 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                disabled={isPending}
                onClick={() => review(item, "approve")}
              >
                {pendingId === item.id && isPending ? "Procesando…" : "Aprobar"}
              </button>
              <button
                className="min-h-10 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50"
                disabled={isPending}
                onClick={() => review(item, "reject")}
              >
                Rechazar
              </button>
              <a
                className="inline-flex min-h-10 items-center rounded-xl border px-3 text-xs font-semibold text-muted hover:text-brand"
                href={`/projects/${item.projectId}#staff-assignment`}
              >
                Ver
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-xs text-muted">{label}</p>;
}
