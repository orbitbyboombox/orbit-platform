"use client";

import { ArrowRight, Banknote, CalendarDays, ChevronLeft, ChevronRight, FilePlus2, FolderPlus, MapPin, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

const agendaEvents = [
  { id: "evento-lumen", client: "Lumen Producciones", type: "Empresa", date: "2026-08-08", time: "19:30", location: "Centro Parque", status: "Confirmado" },
  { id: "evento-vicente", client: "Cumpleaños Vicente", type: "Cumpleaños", date: "2026-08-13", time: "17:00", location: "Club de Polo", status: "Confirmado" },
  { id: "evento-nova", client: "Nova Summit", type: "Empresa", date: "2026-08-19", time: "09:00", location: "Metropolitan Santiago", status: "Preparación" },
  { id: "evento-isidora", client: "Isidora + Benjamín", type: "Matrimonio", date: "2026-08-24", time: "18:30", location: "Casa García-Huidobro", status: "Confirmado" },
  { id: "evento-atlas", client: "Atlas Awards", type: "Empresa", date: "2026-09-01", time: "20:00", location: "Espacio Riesco", status: "Confirmado" },
] as const;

const agendaOrigin = new Date("2026-08-05T12:00:00Z");
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-CL", { ...options, timeZone: "UTC" }).format(date);

const priorityProjects = [
  { id: "matrimonio-silva", name: "Matrimonio Silva", stage: "Preparación", score: "92 / 100", status: "En curso", variant: "success" as const },
  { id: "cumbre-northstar", name: "Cumbre Northstar", stage: "Reserva", score: "78 / 100", status: "Requiere atención", variant: "warning" as const },
  { id: "cumpleanos-emilia", name: "Cumpleaños Emilia", stage: "Confirmado", score: "88 / 100", status: "Saludable", variant: "info" as const },
] as const;

const summary = [
  { label: "Decisiones críticas", value: "2", dot: "bg-danger" },
  { label: "Decisiones importantes", value: "4", dot: "bg-warning" },
  { label: "Proyectos activos", value: "7", dot: "bg-success" },
] as const;

export function HomeExperience() {
  const router = useRouter();
  const [agendaWindow, setAgendaWindow] = useState(0);
  const openProject = (id = "matrimonio-silva") => router.push(`/projects/${id}`);
  const windowStart = addDays(agendaOrigin, agendaWindow * 15);
  const windowEnd = addDays(windowStart, 15);
  const visibleEvents = agendaEvents.filter((event) => { const date = new Date(`${event.date}T12:00:00Z`); return date >= windowStart && date < windowEnd; });

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={
        <section className="overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Miércoles, 5 de agosto</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Buenos días, Matías <span aria-hidden="true">👋</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">Tu día está listo. ORBIT ordenó lo importante para que puedas avanzar con claridad.</p>
            </div>
            <ActionButton className="w-full sm:w-auto" icon={ArrowRight} iconPosition="end" label="Comenzar mi día" onClick={() => document.getElementById("decision-recomendada")?.scrollIntoView({ behavior: "smooth" })} />
          </div>
          <div className="mt-8 grid gap-3 border-t pt-6 sm:grid-cols-3">
            {summary.map((item) => (
              <div className="rounded-xl bg-accent/60 px-4 py-4" key={item.label}>
                <div className="flex items-center gap-2 text-sm text-muted"><span aria-hidden="true" className={`size-2 rounded-full ${item.dot}`} /><span>{item.label}</span></div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      }
      mainContent={
        <div className="space-y-10">
          <section aria-labelledby="agenda-eventos">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Agenda</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="agenda-eventos">Próximos 15 días</h2><p className="mt-2 text-sm text-muted">{formatDate(windowStart, { day: "numeric", month: "short" })} — {formatDate(addDays(windowEnd, -1), { day: "numeric", month: "short", year: "numeric" })}</p></div>
              <div className="flex items-center gap-2"><Button aria-label="Ver 15 días anteriores" disabled={agendaWindow === 0} onClick={() => setAgendaWindow((current) => Math.max(0, current - 1))} size="icon" variant="outline"><ChevronLeft aria-hidden="true" className="size-4" /></Button><Button aria-label="Ver siguientes 15 días" onClick={() => setAgendaWindow((current) => current + 1)} size="icon" variant="outline"><ChevronRight aria-hidden="true" className="size-4" /></Button></div>
            </div>
            {visibleEvents.length ? <div className="flex snap-x gap-4 overflow-x-auto pb-2">{visibleEvents.map((event) => <SmartCard actionLabel="Abrir proyecto" className="min-w-[17rem] flex-1 snap-start sm:min-w-[20rem]" icon={<CalendarDays aria-hidden="true" className="size-5" />} key={event.id} onAction={() => openProject(event.id)} primaryValue={event.client} secondaryValue={`${formatDate(new Date(`${event.date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long" })} · ${event.time}`} status={<StatusBadge label={event.status} variant={event.status === "Preparación" ? "info" : "success"} />} title={event.type}><div className="flex items-start gap-2 text-sm text-muted"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{event.location}</span></div></SmartCard>)}</div> : <SmartCard icon={<CalendarDays aria-hidden="true" className="size-5" />} primaryValue="Sin eventos programados" secondaryValue="No hay eventos en esta ventana de 15 días." title="Agenda libre" />}
          </section>
          <section aria-labelledby="proyectos-prioritarios">
            <div className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">En foco</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="proyectos-prioritarios">Proyectos prioritarios</h2></div>
            <div className="grid gap-4 xl:grid-cols-3">
              {priorityProjects.map((project) => (
                <SmartCard actionLabel="Abrir proyecto" key={project.id} onAction={() => openProject(project.id)} primaryValue={project.score} secondaryValue={`Etapa actual · ${project.stage}`} status={<StatusBadge label={project.status} variant={project.variant} />} title={project.name} />
              ))}
            </div>
          </section>
        </div>
      }
      copilot={
        <div id="decision-recomendada">
          <OrbitCopilot actionLabel="Asignar operador" ariaLabel="Recomendación de ORBIT Copilot" estimatedTime="30 segundos" impact="La preparación no puede avanzar hasta completar esta decisión." onAction={() => openProject()} reason="El próximo evento aún no tiene operador asignado." recommendation="Asignar operador" title="Decisión recomendada" />
        </div>
      }
      timeline={null}
      bottomAction={
        <section aria-labelledby="acciones-rapidas" className="border-t pt-8">
          <div className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Atajos</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="acciones-rapidas">Acciones rápidas</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionButton icon={FolderPlus} label="Nuevo proyecto" onClick={() => router.push("/projects")} variant="outline" />
            <ActionButton icon={Banknote} label="Registrar pago" onClick={() => router.push("/finance")} variant="outline" />
            <ActionButton icon={FilePlus2} label="Crear cotización" onClick={() => router.push("/projects")} variant="outline" />
            <ActionButton icon={UserRound} label="Buscar cliente" onClick={() => router.push("/leads")} variant="outline" />
          </div>
        </section>
      }
    />
  );
}
