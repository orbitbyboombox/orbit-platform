"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Contact,
  FilePlus2,
  ReceiptText,
  Settings2,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FinanceDashboardReadModel, FinanceMetric } from "@/features/finance/finance-read-model";
import { PersonalWorkspaceSections } from "./personal-workspace";

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

const quickActions = [
  { label: "Nuevo Evento", href: "/projects?reservation=new", icon: FilePlus2 },
  { label: "Clientes", href: "/customers", icon: Contact },
  { label: "Staff", href: "/resources/staff", icon: UsersRound },
  { label: "Calendario", href: "/projects?view=calendar", icon: CalendarDays },
  { label: "Registrar Gasto", href: "/finance/expenses?action=new", icon: ReceiptText },
] as const;

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const formatMetric = (metric: FinanceMetric) => {
  if (metric.format === "money") return money(metric.value);
  if (metric.format === "percent") return `${metric.value.toFixed(1)}%`;
  return new Intl.NumberFormat("es-CL").format(metric.value);
};

export function FounderWorkspaceExperience({
  currentDate,
  finance,
  founderName,
  pendingTasks,
  publicationConsole,
  recentActivity,
  todayEvents,
  todayOperation,
  upcomingEvents,
}: {
  currentDate: string;
  finance: FinanceDashboardReadModel;
  founderName: string;
  pendingTasks: number;
  publicationConsole?: React.ReactNode;
  recentActivity: CommandCenterItem[];
  todayEvents: number;
  todayOperation: CommandCenterItem[];
  upcomingEvents: CommandCenterEvent[];
}) {
  const router = useRouter();
  const findHeadline = (label: string) =>
    finance.headline.find((item) => item.label === label);
  const findForecast = (label: string) =>
    finance.forecast.find((item) => item.label === label);
  const fallback = (label: string, href: string): FinanceMetric => ({
    label,
    value: 0,
    format: "money",
    detail: "Sin movimientos canónicos en el período.",
    href,
  });
  const kpis = [
    findHeadline("Caja disponible") ?? fallback("Caja disponible", "/finance/cash-flow"),
    findHeadline("Por cobrar") ?? fallback("Cobros pendientes", "/finance/receivables"),
    {
      label: "Eventos de hoy",
      value: todayEvents,
      format: "count" as const,
      detail: "Agenda operacional del día.",
      href: "/projects?date=today",
    },
    findHeadline("Profit neto") ?? fallback("Profit actual", "/projects?view=profitability"),
    findForecast("Pagos proyectados") ?? fallback("Pagos próximos", "/finance/payables"),
    findHeadline("Nómina") ?? fallback("Próxima nómina", "/resources/staff?workspace=payroll"),
  ];

  const welcome = (
    <header className="overflow-hidden rounded-[2rem] border bg-card px-6 py-7 shadow-sm sm:px-8 sm:py-9 lg:px-10">
      <div className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Founder Command Center</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl lg:text-6xl">
          Buenos días, {founderName} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-3 text-sm capitalize text-muted sm:text-base">{currentDate}</p>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-foreground/80">
          Tienes <strong className="text-foreground">{todayEvents} eventos hoy</strong> y{" "}
          <strong className="text-foreground">{pendingTasks} prioridades operacionales</strong> pendientes.
        </p>
      </div>
    </header>
  );

  const founderKpis = (
    <section aria-labelledby="founder-kpis-title">
      <SectionHeading eyebrow="Estado de BOOMBOX" id="founder-kpis-title" title="Lo esencial, ahora" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((metric, index) => (
          <button
            className="group min-h-40 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:p-5"
            key={`${metric.label}-${index}`}
            onClick={() => router.push(metric.href)}
          >
            <span className="flex items-start justify-between gap-3">
              <KpiIcon index={index} />
              <ArrowUpRight className="size-4 text-muted transition group-hover:text-brand" />
            </span>
            <strong className="mt-7 block text-2xl tracking-[-.03em] sm:text-3xl">{formatMetric(metric)}</strong>
            <span className="mt-2 block text-xs font-semibold uppercase tracking-[.08em] text-muted">{metric.label}</span>
          </button>
        ))}
      </div>
    </section>
  );

  const today = (
    <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="today-operation-title">
      <SectionHeading eyebrow="Ahora" id="today-operation-title" title="Operación de hoy" />
      <div className="mt-5 divide-y">
        {todayOperation.map((item) => (
          <Link className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-4 first:pt-0 last:pb-0" href={item.href} key={item.id}>
            <time className="font-mono text-sm font-semibold text-brand">{item.time ?? "Ahora"}</time>
            <span className="min-w-0">
              <strong className="block truncate text-sm">{item.title}</strong>
              <span className="mt-1 block truncate text-xs text-muted">{item.detail}</span>
            </span>
            <ArrowUpRight className="size-4 text-muted group-hover:text-brand" />
          </Link>
        ))}
        {!todayOperation.length && <EmptyState label="No hay prioridades operacionales para hoy." />}
      </div>
    </section>
  );

  const alerts = (
    <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="founder-alerts-title">
      <SectionHeading eyebrow="Atención" id="founder-alerts-title" title="Alertas accionables" />
      <div className="mt-5 space-y-2">
        {finance.risks.slice(0, 6).map((risk) => (
          <Link className="group flex items-center gap-3 rounded-xl border bg-background/35 p-3.5 transition hover:border-brand/40" href={risk.href} key={risk.key}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${risk.severity === "danger" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
              <AlertTriangle className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">{risk.label}</strong>
              <span className="mt-0.5 block truncate text-xs text-muted">{risk.count} pendientes · {money(risk.amount)}</span>
            </span>
            <ArrowUpRight className="size-4 text-muted group-hover:text-brand" />
          </Link>
        ))}
        {!finance.risks.length && <EmptyState label="No hay alertas financieras accionables." />}
      </div>
    </section>
  );

  const upcoming = (
    <section aria-labelledby="upcoming-events-title">
      <SectionHeading eyebrow="Próximos 15 días" id="upcoming-events-title" title="Eventos próximos" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {upcomingEvents.slice(0, 6).map((event) => (
          <Link className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md" href={event.href} key={event.id}>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-brand">{event.date}</span>
              <span className="rounded-full bg-info/10 px-2.5 py-1 text-[10px] font-semibold text-info">{event.status}</span>
            </div>
            <h3 className="mt-5 truncate text-lg font-semibold">{event.title}</h3>
            <p className="mt-1 truncate text-sm text-muted">{event.service}</p>
            <div className="mt-5 space-y-2 text-xs text-muted">
              <p className="flex items-center gap-2"><CalendarDays className="size-3.5 text-brand" />{event.location || "Ubicación pendiente"}</p>
              <p className="flex items-center gap-2"><UsersRound className="size-3.5 text-brand" />{event.staff}</p>
            </div>
          </Link>
        ))}
        {!upcomingEvents.length && <EmptyState label="No hay eventos próximos registrados." />}
      </div>
    </section>
  );

  const activity = (
    <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="recent-activity-title">
      <SectionHeading eyebrow="En vivo" id="recent-activity-title" title="Actividad reciente" />
      <div className="mt-5 space-y-4">
        {recentActivity.slice(0, 7).map((item) => (
          <Link className="group flex gap-3" href={item.href} key={item.id}>
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{item.title}</strong>
              <span className="mt-1 block truncate text-xs text-muted">{item.detail}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted group-hover:text-brand" />
          </Link>
        ))}
        {!recentActivity.length && <EmptyState label="Todavía no hay actividad operacional reciente." />}
      </div>
    </section>
  );

  const actions = (
    <section aria-labelledby="quick-actions-title">
      <SectionHeading eyebrow="Resolver" id="quick-actions-title" title="Acciones rápidas" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link className="group flex min-h-24 items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md" href={action.href} key={action.label}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="size-4" /></span>
              <span className="text-sm font-semibold">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );

  const workspaceSettings = (
    <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="workspace-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Tu espacio</p>
          <h2 className="mt-2 text-xl font-semibold" id="workspace-settings-title">Founder Workspace</h2>
          <p className="mt-1 text-sm text-muted">Mueve, oculta o restaura cada bloque. Tu configuración permanece guardada.</p>
        </div>
        <Link className="inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:border-brand hover:text-brand" href="/settings#founder-workspace">
          <Settings2 className="mr-2 size-4" /> Configurar espacio
        </Link>
      </div>
    </section>
  );

  return (
    <main id="founder-workspace">
      <PersonalWorkspaceSections
        moduleKey="DASHBOARD"
        sections={[
          { key: "DASHBOARD_HEADER", label: "Bienvenida", content: welcome },
          { key: "DASHBOARD_WIDGETS", label: "KPIs del Founder", content: founderKpis },
          { key: "DASHBOARD_TODAY", label: "Operación de hoy", content: <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">{today}{alerts}</div> },
          { key: "DASHBOARD_UPCOMING", label: "Próximos eventos", content: upcoming },
          { key: "DASHBOARD_ACTIVITY", label: "Actividad reciente", content: activity },
          { key: "DASHBOARD_QUICK_ACTIONS", label: "Acciones rápidas", content: actions },
          ...(publicationConsole ? [{ key: "PUBLICATION_CONSOLE", label: "Consola de publicación", content: publicationConsole }] : []),
          { key: "DASHBOARD_WORKSPACE_SETTINGS", label: "Configuración del Workspace", content: workspaceSettings },
        ]}
      />
    </main>
  );
}

function SectionHeading({ eyebrow, id, title }: { eyebrow: string; id: string; title: string }) {
  return <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.025em]" id={id}>{title}</h2></header>;
}

function KpiIcon({ index }: { index: number }) {
  const icons = [WalletCards, CircleDollarSign, CalendarDays, TrendingUp, ReceiptText, Clock3];
  const Icon = icons[index] ?? Sparkles;
  return <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="size-4" /></span>;
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-sm text-muted">{label}</p>;
}
