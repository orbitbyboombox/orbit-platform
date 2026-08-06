"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, FileSignature, PackageCheck, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { SectionTitle } from "@/components/layout/section-title";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";

export interface ProductionAssignment {
  id: string;
  projectId: string;
  staffId?: string | null;
  type: string;
  status: string;
  resources: Record<string, unknown>;
}

export type ReadinessState = "READY" | "ATTENTION" | "MISSING";
export interface CommandCenterProjectReadiness {
  projectId: string;
  customerName: string;
  projectName: string;
  eventDate: string;
  eventTime: string;
  paymentReady: boolean;
  statuses: readonly { label:string; state:ReadinessState }[];
}

const statusPresentation:Record<ReadinessState,{label:string;variant:"success"|"warning"|"danger"}> = {
  READY: { label: "Listo", variant: "success" },
  ATTENTION: { label: "Atención", variant: "warning" },
  MISSING: { label: "Falta", variant: "danger" },
};

function EventReadinessCard({ item }: { item:CommandCenterProjectReadiness }) {
  const router = useRouter();
  const missing = item.statuses.filter(({ state }) => state === "MISSING").length + (item.paymentReady ? 0 : 1);
  const attention = item.statuses.filter(({ state }) => state === "ATTENTION").length;
  const ready = missing === 0 && attention === 0;
  return <article className="rounded-2xl border bg-card p-5 sm:p-6">
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{item.eventDate || "Fecha pendiente"} · {item.eventTime || "Hora pendiente"}</p><h3 className="mt-2 text-xl font-semibold tracking-tight">{item.customerName}</h3><p className="mt-1 text-sm text-muted">{item.projectName}</p></div>
      <StatusBadge label={ready ? "Ready" : missing ? "Blocked" : "Attention"} variant={ready ? "success" : missing ? "danger" : "warning"} />
    </div>
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{item.statuses.map((status) => <div className="flex min-h-16 flex-col justify-between rounded-xl border bg-background/35 p-3" key={status.label}><p className="text-xs font-medium text-muted">{status.label}</p><div className="mt-2"><StatusBadge label={statusPresentation[status.state].label} variant={statusPresentation[status.state].variant} /></div></div>)}</div>
    <div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs text-muted">Panel informativo. La operación nunca se bloquea automáticamente.</p><Button onClick={() => router.push(`/projects/${item.projectId}#event-readiness`)} variant="outline">Abrir evento</Button></div>
  </article>;
}

function Metric({ label, value, icon:Icon, tone="neutral" }: { label:string; value:number; icon:typeof CalendarDays; tone?:"neutral"|"success"|"warning"|"danger" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-brand";
  return <article className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-center justify-between"><Icon aria-hidden="true" className={`size-4 ${toneClass}`} /><span className="text-2xl font-semibold tabular-nums">{value}</span></div><p className="mt-3 text-xs leading-5 text-muted sm:text-sm">{label}</p></article>;
}

export function CommandCenter({ readiness, availableOperators, availableTotems, availableCases }: { readiness:readonly CommandCenterProjectReadiness[]; availableOperators:number; availableTotems:number; availableCases:number }) {
  const router = useRouter();
  const context = ORBIT_TIME_ENGINE.getCurrentContext("Matías");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const todayEvents = readiness.filter((item) => item.eventDate === today);
  const pendingContracts = readiness.filter((item) => item.statuses.some((status) => (status.label === "Acuerdo" || status.label === "Firma") && status.state !== "READY")).length;
  const pendingPayments = readiness.filter((item) => !item.paymentReady).length;
  const readyEvents = readiness.filter((item) => item.paymentReady && item.statuses.every((status) => status.state === "READY")).length;
  const blockedEvents = readiness.filter((item) => !item.paymentReady || item.statuses.some((status) => status.state === "MISSING")).length;
  const alerts = readiness.filter((item) => !item.paymentReady || item.statuses.some((status) => status.state !== "READY"));
  const firstAlert = alerts[0];

  return <div className="space-y-9 lg:space-y-11">
    <section className="overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10"><p className="text-sm font-medium text-muted">{context.formattedDate} · {context.localTime}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Centro de Comando</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Decisiones, disponibilidad y preparación operacional en un solo lugar.</p></section>

    <section aria-label="Resumen operacional" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Metric icon={CalendarDays} label="Eventos de hoy" value={todayEvents.length} />
      <Metric icon={FileSignature} label="Contratos pendientes" tone="warning" value={pendingContracts} />
      <Metric icon={CircleDollarSign} label="Pagos pendientes" tone="warning" value={pendingPayments} />
      <Metric icon={UserCheck} label="Operadores disponibles" tone="success" value={availableOperators} />
      <Metric icon={PackageCheck} label="Tótems disponibles" tone="success" value={availableTotems} />
      <Metric icon={PackageCheck} label="Cases disponibles" tone="success" value={availableCases} />
      <Metric icon={AlertTriangle} label="Alertas operacionales" tone={alerts.length ? "danger" : "success"} value={alerts.length} />
      <Metric icon={CheckCircle2} label="Eventos ready" tone="success" value={readyEvents} />
      <Metric icon={ShieldAlert} label="Eventos bloqueados" tone={blockedEvents ? "danger" : "success"} value={blockedEvents} />
    </section>

    {firstAlert ? <section className="rounded-2xl border border-brand/25 bg-card p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">ORBIT NOVA · recomendación operacional</p><p className="mt-2 text-lg font-semibold">Revisar preparación de {firstAlert.customerName}.</p><p className="mt-1 text-sm text-muted">Existe información pendiente antes del evento.</p></div></div><Button onClick={() => router.push(`/projects/${firstAlert.projectId}#event-readiness`)}>Resolver ahora</Button></div></section> : <section className="rounded-2xl border bg-card p-5 sm:p-6"><p className="font-semibold">Todo está listo para operar.</p><p className="mt-1 text-sm text-muted">No existen alertas operacionales pendientes.</p></section>}

    <section className="space-y-5"><SectionTitle description="Agenda operacional construida con eventos productivos de la jornada." title="Eventos de hoy" /><div className="grid gap-4 lg:grid-cols-2">{todayEvents.map((item) => <EventReadinessCard item={item} key={item.projectId} />)}{!todayEvents.length && <div className="rounded-2xl border bg-card p-6"><p className="font-semibold">No hay eventos programados para hoy.</p><p className="mt-2 text-sm text-muted">El próximo evento confirmado aparecerá automáticamente en esta agenda.</p></div>}</div></section>

    <section className="space-y-5"><SectionTitle description="Cada evento muestra exactamente qué está listo, qué requiere atención y qué información falta." title="Preparación por evento" /><div className="grid gap-4 xl:grid-cols-2">{[...readiness].sort((a,b) => a.eventDate.localeCompare(b.eventDate)).map((item) => <EventReadinessCard item={item} key={item.projectId} />)}{!readiness.length && <div className="rounded-2xl border bg-card p-6"><p className="font-semibold">Aún no hay eventos operacionales.</p><p className="mt-2 text-sm text-muted">Crea un cliente y su proyecto para comenzar a preparar la operación.</p><Button className="mt-5" onClick={() => router.push("/projects")}>Abrir clientes</Button></div>}</div></section>
  </div>;
}
