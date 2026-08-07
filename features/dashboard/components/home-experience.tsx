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
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiveExpenseCapture } from "@/features/expense-capture";
import { ORBIT_TIME_ENGINE, type CountdownVisualState } from "@/features/time-intelligence";
import type { Project } from "@/features/projects/types/project";

const COUNTDOWN_VARIANT: Record<CountdownVisualState, "success" | "warning" | "danger" | "info" | "neutral"> = {
  GREEN: "success", YELLOW: "warning", ORANGE: "warning", RED: "danger", PRIMARY: "info", COMPLETED: "neutral", ARCHIVED: "neutral",
};

const executiveServices = [
  { label: "Workspace", status: "Operativo", icon: Check, variant: "success" as const },
  { label: "Calendar", status: "Conexión pendiente", icon: CalendarDays, variant: "warning" as const },
  { label: "Drive", status: "Conexión pendiente", icon: Cloud, variant: "warning" as const },
  { label: "Gmail", status: "Conexión pendiente", icon: Mail, variant: "warning" as const },
  { label: "NOVA", status: "Disponible", icon: Sparkles, variant: "success" as const },
] as const;

export function HomeExperience({ projects }: { projects: readonly Project[] }) {
  const router = useRouter();
  const [expenseCaptureOpen, setExpenseCaptureOpen] = useState(false);
  const timeContext = ORBIT_TIME_ENGINE.getCurrentContext("Matías");
  const openProject = (id = "evento-lumen") => router.push(`/projects/${id}`);
  const agendaEvents = projects.filter((project) => project.event.date).map((project) => ({ id: project.id, client: project.client.name, type: project.type, service: project.services.length ? project.services.join(" · ") : "Servicio por confirmar", date: project.event.date, time: project.event.time, location: [project.event.location, project.event.city].filter(Boolean).join(", ") || "Ubicación por confirmar", status: project.stage ?? project.status }));
  const nextEvent = agendaEvents.find((event) => ORBIT_TIME_ENGINE.getCountdown({ eventDate: event.date }).state === "FUTURE") ?? agendaEvents[0] ?? { id: "", client: "Sin eventos confirmados", type: "", service: "Cuando exista un evento confirmado aparecerá aquí.", date: new Date().toISOString().slice(0, 10), time: "—", location: "Sin ubicación", status: "Sin eventos" };
  const hasEvents = agendaEvents.length > 0;
  const nextEventIntelligence = ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: nextEvent.date });
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = agendaEvents.filter((event) => event.date === today).length;
  const critical = projects.filter((project) => project.health === "Critical" || project.health === "Risk").length;
  const pending = projects.filter((project) => project.commercialStage === "Reserved" || project.commercialStage === "Waiting").length;
  const nextFifteen = agendaEvents.filter((event) => { const days = Math.ceil((new Date(`${event.date}T12:00:00Z`).getTime() - Date.now()) / 86_400_000); return days >= 0 && days <= 15; }).length;

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={
        <section className="relative overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
          <div aria-hidden="true" className="absolute -right-20 -top-24 size-72 rounded-full bg-brand/5 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted"><span>{timeContext.formattedDate}</span><span aria-hidden="true">·</span><span>{timeContext.localTime}</span></div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">{timeContext.greetingText}</h1>
              <p className="mt-3 text-lg font-medium text-foreground/90 sm:text-xl">{hasEvents ? "Tu operación está actualizada." : "Aún no hay eventos confirmados."}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{hasEvents ? "Revisa la siguiente decisión antes del próximo evento." : "Crea o confirma un proyecto para comenzar la planificación."}</p>
            </div>
            <ActionButton className="min-h-12 w-full px-6 sm:w-auto" icon={ArrowRight} iconPosition="end" label="Revisar prioridades" onClick={() => document.getElementById("prioridad-del-dia")?.scrollIntoView({ behavior: "smooth" })} />
          </div>
          <dl className="relative mt-8 grid grid-cols-2 gap-x-5 gap-y-5 border-t pt-6 lg:grid-cols-4">
            {[{ value: todayEvents.toString(), label: "eventos hoy" }, { value: critical.toString(), label: "decisiones críticas" }, { value: pending.toString(), label: "aprobaciones pendientes" }, { value: nextFifteen.toString(), label: "eventos en 15 días" }].map((item) => <div key={item.label}><dd className="text-2xl font-semibold tracking-tight">{item.value}</dd><dt className="mt-1 text-xs text-muted sm:text-sm">{item.label}</dt></div>)}
          </dl>
        </section>
      }
      mainContent={
        <div className="space-y-8 lg:space-y-10">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" id="prioridad-del-dia">
            <article className="rounded-2xl border border-warning/35 bg-[linear-gradient(145deg,hsl(var(--card)),hsl(var(--warning-soft)))] p-5 shadow-lg shadow-black/10 sm:p-7">
              <div className="flex items-center justify-between gap-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-warning"><CircleAlert aria-hidden="true" className="size-4" />Prioridad del día</p><StatusBadge label="Crítica" variant="danger" /></div>
              <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{hasEvents ? nextEventIntelligence.timeline.nextAction : "Aún no hay una prioridad operacional"}</h2>
              <p className="mt-2 text-sm text-muted">{hasEvents ? `${nextEvent.client} · ${nextEvent.status}` : "Confirma un proyecto para comenzar la planificación."}</p>
              <ActionButton className="mt-7 min-h-12 w-full px-6 sm:w-auto" icon={ArrowRight} iconPosition="end" label={hasEvents ? "Resolver ahora" : "Abrir clientes"} onClick={() => hasEvents ? openProject(nextEvent.id) : router.push("/projects")} />
            </article>

            {hasEvents ? <SmartCard
              actionLabel="Abrir evento"
              icon={<CalendarClock aria-hidden="true" className="size-5" />}
              onAction={() => hasEvents ? openProject(nextEvent.id) : router.push("/projects")}
              primaryValue={nextEvent.client}
              secondaryValue={`${nextEvent.service} · ${nextEvent.time}`}
              status={<StatusBadge label={nextEventIntelligence.countdown.label} variant={COUNTDOWN_VARIANT[nextEventIntelligence.countdown.visualState]} />}
              title="Próximo evento"
            >
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Ubicación</dt><dd className="mt-1 font-semibold">{nextEvent.location}</dd></div>
                <div><dt className="text-muted">Fase operacional</dt><dd className="mt-1 font-semibold">{nextEventIntelligence.timeline.phaseLabel}</dd></div>
                <div><dt className="text-muted">Próxima acción</dt><dd className="mt-1 font-semibold text-brand">{nextEventIntelligence.timeline.nextAction}</dd></div>
              </dl>
            </SmartCard> : <SmartCard actionLabel="Abrir clientes" icon={<CalendarClock aria-hidden="true" className="size-5" />} onAction={() => router.push("/projects")} primaryValue="Sin eventos confirmados" secondaryValue="Cuando confirmes un proyecto, aparecerá aquí con su cuenta regresiva y próxima acción." title="Próximo evento" />}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
            <SmartCard icon={<AlertTriangle aria-hidden="true" className="size-5" />} title="Centro de decisiones">
              <div className="grid gap-2 sm:grid-cols-3">
                {[{ label: "Críticas", value: critical.toString(), detail: "Resolver ahora", variant: "danger" as const }, { label: "Requieren atención", value: projects.filter((project) => project.health === "Attention").length.toString(), detail: "Revisar hoy", variant: "warning" as const }, { label: "Finalizadas", value: projects.filter((project) => project.status === "Completed" || project.status === "Archived").length.toString(), detail: "Ver actividad", variant: "success" as const }].map((decision) => (
                  <Button className="h-auto justify-between rounded-xl px-4 py-4 text-left" key={decision.label} onClick={() => router.push("/operations")} variant="outline"><span><span className="block text-xs text-muted">{decision.label}</span><span className="mt-1 block text-2xl font-semibold">{decision.value}</span><span className="mt-2 block text-xs text-muted">{decision.detail}</span></span><ChevronRight aria-hidden="true" className="size-4" /></Button>
                ))}
              </div>
            </SmartCard>
            <SmartCard icon={<Check aria-hidden="true" className="size-5" />} title="Estado ejecutivo">
              <div className="divide-y divide-border/70">
                {executiveServices.map(({ label, status, icon: Icon, variant }) => <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0" key={label}><span className="flex items-center gap-2 text-sm"><Icon aria-hidden="true" className="size-4 text-muted" />{label}</span><StatusBadge label={status} variant={variant} /></div>)}
              </div>
            </SmartCard>
          </section>

          <section aria-labelledby="agenda-ejecutiva">
            <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Agenda</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="agenda-ejecutiva">Próximos movimientos</h2></div><Button onClick={() => router.push("/operations")} variant="ghost">Ver operación <ChevronRight aria-hidden="true" className="ml-1 size-4" /></Button></div>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {agendaEvents.slice(0, 3).map((event, index) => { const intelligence = ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: event.date }); return <button className="grid w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-accent/50 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:px-6" key={event.id} onClick={() => openProject(event.id)} type="button"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{index === 0 ? "Próximo" : index === 1 ? "Siguiente" : "Futuro"}</p><p className="mt-1 text-sm font-medium">{event.time}</p></div><div><p className="font-semibold">{event.client}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin aria-hidden="true" className="size-3.5" />{event.location} · {event.service}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><StatusBadge label={intelligence.countdown.label} variant={COUNTDOWN_VARIANT[intelligence.countdown.visualState]} /><ChevronRight aria-hidden="true" className="size-4 text-muted" /></div></button>; })}
              {!agendaEvents.length && <div className="px-6 py-10 text-center"><p className="font-medium">Aún no hay eventos confirmados.</p><p className="mt-2 text-sm text-muted">Los próximos eventos aparecerán aquí después de su confirmación.</p><ActionButton className="mt-5" label="Abrir clientes" onClick={() => router.push("/projects")} /></div>}
            </div>
          </section>

          <section aria-label="NOVA Executive Copilot">
            {hasEvents && <OrbitCopilot actionLabel={nextEventIntelligence.timeline.nextAction} ariaLabel="Recomendación ejecutiva de NOVA" estimatedTime="30 segundos" impact="Mantiene el proyecto dentro de su fase operacional." onAction={() => openProject(nextEvent.id)} reason={`El proyecto ${nextEvent.client} requiere continuar con su siguiente etapa.`} recommendation={nextEventIntelligence.timeline.nextAction} title="NOVA · Recomendación ejecutiva" />}
          </section>
        </div>
      }
      copilot={null}
      timeline={null}
      bottomAction={
        <section aria-labelledby="acciones-rapidas" className="border-t pt-7">
          <div className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Acciones rápidas</p><h2 className="sr-only" id="acciones-rapidas">Acciones rápidas</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionButton className="min-h-12" icon={Camera} label="Sube tu gasto aquí" onClick={() => setExpenseCaptureOpen(true)} />
            <ActionButton icon={FolderPlus} label="Nueva reserva" onClick={() => router.push("/projects?reservation=new")} variant="outline" />
            <ActionButton disabled icon={FilePlus2} label="Cotización no configurada" variant="outline" />
            <ActionButton icon={UserRound} label="Buscar cliente" onClick={() => router.push("/projects")} variant="outline" />
          </div>
          <LiveExpenseCapture onClose={() => setExpenseCaptureOpen(false)} open={expenseCaptureOpen} />
        </section>
      }
    />
  );
}
