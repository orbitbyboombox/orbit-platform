"use client";

import { AlertTriangle, CalendarDays, Camera, CheckCircle2, CircleDollarSign, Clock3, FileSignature, ListChecks, PackageCheck, Plus, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { SectionTitle } from "@/components/layout/section-title";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import { LiveExpenseCapture } from "@/features/expense-capture";
import { useState } from "react";

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

function Metric({ href, label, value, icon:Icon, tone="neutral" }: { href:string; label:string; value:number; icon:typeof CalendarDays; tone?:"neutral"|"success"|"warning"|"danger" }) {
  const router = useRouter();
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-brand";
  return <button aria-label={`Abrir ${label}`} className="rounded-2xl border bg-card p-4 text-left transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:p-5" onClick={()=>router.push(href)}><div className="flex items-center justify-between"><Icon aria-hidden="true" className={`size-4 ${toneClass}`} /><span className="text-2xl font-semibold tabular-nums">{value}</span></div><p className="mt-3 text-xs leading-5 text-muted sm:text-sm">{label}</p></button>;
}

function EquipmentMetric({ cases, cameras, printers, totems }: { cases:number; cameras:number; printers:number; totems:number }) {
  const router = useRouter();
  return <button aria-label="Abrir Equipamiento disponible" className="rounded-2xl border bg-card p-4 text-left transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:p-5" onClick={() => router.push("/resources")}><div className="flex items-center justify-between"><PackageCheck aria-hidden="true" className="size-4 text-success"/><span className="text-2xl font-semibold tabular-nums">{totems + cases + printers + cameras}</span></div><p className="mt-3 text-xs leading-5 text-muted sm:text-sm">Equipamiento disponible</p><p className="mt-2 text-[0.6875rem] leading-5 text-muted">{totems} tótems · {cases} cases<br/>{printers} impresoras · {cameras} cámaras</p></button>;
}

export function CommandCenter({ readiness, availableOperators, availableTotems, availableCases, availablePrinters, availableCameras, taskSummary, executive }: { readiness:readonly CommandCenterProjectReadiness[]; availableOperators:number; availableTotems:number; availableCases:number; availablePrinters:number; availableCameras:number; taskSummary:{pending:number;critical:number;overdue:number;today:number}; executive:{next15Events:number;accountsReceivable:number;monthlyRevenue:number;monthlyGoal:number} }) {
  const router = useRouter();
  const [expenseOpen,setExpenseOpen]=useState(false);
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
    <section className="overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10"><p className="text-sm font-medium text-muted">{context.formattedDate} · {context.localTime}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{context.greetingText}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Este es tu centro de control diario: revisa primero las alertas, abre el evento que requiere atención y ejecuta su siguiente acción desde un solo lugar.</p><p className="mt-2 max-w-2xl text-sm text-muted">Existe para convertir información operacional en decisiones claras, sin recorrer módulo por módulo.</p></section>

    <section aria-label="Acciones principales" className="grid gap-3 sm:grid-cols-2"><Button className="min-h-14 text-base font-semibold" onClick={()=>router.push("/projects?reservation=new")}><Plus className="mr-2 size-5"/>Nueva reserva</Button><Button className="min-h-14 text-base font-semibold" onClick={()=>setExpenseOpen(true)} variant="outline"><Camera className="mr-2 size-5"/>Subir gasto</Button></section><LiveExpenseCapture onClose={()=>setExpenseOpen(false)} open={expenseOpen}/>

    <section aria-label="Resumen ejecutivo" className="grid grid-cols-2 gap-3 lg:grid-cols-4"><button className="rounded-2xl border bg-card p-5 text-left transition hover:border-brand" onClick={()=>router.push("/projects")}><p className="text-2xl font-semibold">{executive.next15Events}</p><p className="mt-1 text-sm font-medium">Próximos 15 eventos</p></button><button className="rounded-2xl border bg-card p-5 text-left transition hover:border-brand" onClick={()=>router.push("/finance/receivables")}><p className="text-2xl font-semibold">{executive.accountsReceivable.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0})}</p><p className="mt-1 text-sm font-medium">Cuentas por cobrar</p></button><button className="rounded-2xl border bg-card p-5 text-left transition hover:border-brand" onClick={()=>router.push("/finance")}><p className="text-2xl font-semibold">{executive.monthlyRevenue.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0})}</p><p className="mt-1 text-sm font-medium">Ingresos del mes</p></button><button className="rounded-2xl border bg-card p-5 text-left transition hover:border-brand" onClick={()=>router.push("/settings#master-data")}><p className="text-2xl font-semibold">{executive.monthlyGoal?executive.monthlyGoal.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}):"Sin definir"}</p><p className="mt-1 text-sm font-medium">Meta mensual</p></button></section>

    <section aria-label="Resumen operacional" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Metric href="/projects" icon={CalendarDays} label="Eventos de hoy" value={todayEvents.length} />
      <Metric href="/projects" icon={FileSignature} label="Contratos pendientes" tone="warning" value={pendingContracts} />
      <Metric href="/finance/receivables" icon={CircleDollarSign} label="Cuentas por cobrar" tone="warning" value={pendingPayments} />
      <EquipmentMetric cameras={availableCameras} cases={availableCases} printers={availablePrinters} totems={availableTotems} />
      <Metric href="/resources/staff" icon={UserCheck} label="Staff disponible" tone="success" value={availableOperators} />
      <Metric href="/notifications" icon={AlertTriangle} label="Notificaciones" tone={alerts.length ? "danger" : "success"} value={alerts.length} />
      <Metric href="/projects" icon={CheckCircle2} label="Eventos ready" tone="success" value={readyEvents} />
      <Metric href="/projects" icon={ShieldAlert} label="Eventos bloqueados" tone={blockedEvents ? "danger" : "success"} value={blockedEvents} />
      <Metric href="/tasks" icon={ListChecks} label="Tareas pendientes" tone={taskSummary.pending ? "warning" : "success"} value={taskSummary.pending} />
      <Metric href="/tasks" icon={AlertTriangle} label="Tareas críticas" tone={taskSummary.critical ? "danger" : "success"} value={taskSummary.critical} />
      <Metric href="/tasks" icon={Clock3} label="Tareas vencidas" tone={taskSummary.overdue ? "danger" : "success"} value={taskSummary.overdue} />
      <Metric href="/tasks" icon={CalendarDays} label="Tareas de hoy" tone={taskSummary.today ? "warning" : "success"} value={taskSummary.today} />
    </section>

    <section className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Trabajo pendiente</p><p className="mt-2 text-lg font-semibold">{taskSummary.pending ? `${taskSummary.pending} tareas requieren seguimiento.` : "No hay tareas pendientes."}</p><p className="mt-1 text-sm text-muted">El Centro de Tareas organiza el trabajo futuro; Timeline conserva el historial.</p></div><Button onClick={() => router.push("/tasks")} variant="outline">Abrir tareas</Button></div></section>

    {firstAlert ? <section className="rounded-2xl border border-brand/25 bg-card p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">ORBIT NOVA · recomendación operacional</p><p className="mt-2 text-lg font-semibold">Revisar preparación de {firstAlert.customerName}.</p><p className="mt-1 text-sm text-muted">Existe información pendiente antes del evento.</p></div></div><Button onClick={() => router.push(`/projects/${firstAlert.projectId}#event-readiness`)}>Resolver ahora</Button></div></section> : <section className="rounded-2xl border bg-card p-5 sm:p-6"><p className="font-semibold">Todo está listo para operar.</p><p className="mt-1 text-sm text-muted">No existen alertas operacionales pendientes.</p></section>}

    <section className="space-y-5"><SectionTitle description="Agenda operacional construida con eventos productivos de la jornada." title="Eventos de hoy" /><div className="grid gap-4 lg:grid-cols-2">{todayEvents.map((item) => <EventReadinessCard item={item} key={item.projectId} />)}{!todayEvents.length && <div className="rounded-2xl border bg-card p-6"><p className="font-semibold">No hay eventos programados para hoy.</p><p className="mt-2 text-sm text-muted">Revisa los próximos eventos para anticipar la operación.</p><Button className="mt-5" onClick={() => router.push("/projects")}>Abrir próximos eventos</Button></div>}</div></section>

    <section className="space-y-5"><SectionTitle description="Cada evento muestra exactamente qué está listo, qué requiere atención y qué información falta." title="Preparación por evento" /><div className="grid gap-4 xl:grid-cols-2">{[...readiness].sort((a,b) => a.eventDate.localeCompare(b.eventDate)).map((item) => <EventReadinessCard item={item} key={item.projectId} />)}{!readiness.length && <div className="rounded-2xl border bg-card p-6"><p className="font-semibold">Aún no hay eventos operacionales.</p><p className="mt-2 text-sm text-muted">Crea un cliente y su proyecto para comenzar a preparar la operación.</p><Button className="mt-5" onClick={() => router.push("/projects")}>Abrir clientes</Button></div>}</div></section>
  </div>;
}
