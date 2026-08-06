"use client";

import { CalendarCheck2, CalendarDays, CheckCircle2, CircleAlert, Clock3, FolderOpen, MapPin, Sparkles, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { SmartCard } from "@/components/cards/smart-card";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Project } from "@/features/projects/types/project";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";

export interface ProductionAssignment {
  id: string;
  projectId: string;
  type: string;
  status: string;
  resources: Record<string, unknown>;
}

function ProjectCard({ project, assignments }: { project: Project; assignments: readonly ProductionAssignment[] }) {
  const router = useRouter();
  const intelligence = ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: project.event.date });
  const projectAssignments = assignments.filter((assignment) => assignment.projectId === project.id);
  return <SmartCard icon={<CalendarDays aria-hidden="true" className="size-5" />} primaryValue={project.services.length ? project.services.join(" • ") : "Servicio por confirmar"} secondaryValue={`${project.type} · ${project.event.date || "Fecha por confirmar"}`} status={<StatusBadge label={project.stage ?? project.status} variant="info" />} title={project.client.name}>
    <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Horario</dt><dd className="mt-1 font-medium">{project.event.time || "Por confirmar"}</dd></div><div><dt className="text-muted">Cuenta regresiva</dt><dd className="mt-1 font-medium">{intelligence.countdown.label}</dd></div><div className="sm:col-span-2"><dt className="text-muted">Ubicación</dt><dd className="mt-1 flex items-start gap-2 font-medium"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />{[project.event.location, project.event.city].filter(Boolean).join(", ") || "Por confirmar"}</dd></div><div className="sm:col-span-2"><dt className="text-muted">Asignaciones</dt><dd className="mt-1 font-medium">{projectAssignments.length ? `${projectAssignments.length} registradas` : "Sin asignaciones"}</dd></div></dl>
    <ActionButton className="mt-5" icon={FolderOpen} label="Abrir proyecto" onClick={() => router.push(`/projects/${project.id}`)} variant="outline" />
  </SmartCard>;
}

export function CommandCenter({ projects, assignments, staffCount }: { projects: readonly Project[]; assignments: readonly ProductionAssignment[]; staffCount: number }) {
  const timeContext = ORBIT_TIME_ENGINE.getCurrentContext("Matías");
  const today = new Date().toISOString().slice(0, 10);
  const chronological = [...projects].filter((project) => project.event.date && project.status !== "Archived").sort((a, b) => a.event.date.localeCompare(b.event.date));
  const todayProjects = chronological.filter((project) => project.event.date === today);
  const upcoming = chronological.filter((project) => project.event.date >= today);
  const critical = projects.filter((project) => project.health === "Critical" || project.health === "Risk").length;
  const attention = projects.filter((project) => project.health === "Attention").length;
  const pendingConfirmations = projects.filter((project) => project.commercialStage === "Reserved" || project.commercialStage === "Waiting").length;
  const next = upcoming[0];
  const priority = projects.find((project) => project.health === "Critical" || project.health === "Risk") ?? next;
  const summaries = [
    { label: "Tareas críticas", value: critical, icon: CircleAlert, variant: "danger" as const },
    { label: "Requieren atención", value: attention, icon: Clock3, variant: "warning" as const },
    { label: "Eventos hoy", value: todayProjects.length, icon: CheckCircle2, variant: "success" as const },
    { label: "Confirmaciones próximas", value: pendingConfirmations, icon: CalendarCheck2, variant: "info" as const },
  ];

  return <div className="space-y-10 lg:space-y-12">
    <section className="overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10"><p className="text-sm font-medium text-muted">{timeContext.formattedDate} · {timeContext.localTime}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{timeContext.greetingText}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Resumen construido desde proyectos y asignaciones registradas en ORBIT.</p><div className="mt-8 grid grid-cols-2 gap-5 border-t pt-6 xl:grid-cols-4">{summaries.map(({ icon: Icon, ...item }) => <div key={item.label}><Icon aria-hidden="true" className="size-4 text-muted" /><p className="mt-3 text-2xl font-semibold">{item.value}</p><p className="mt-1 text-xs text-muted sm:text-sm">{item.label}</p></div>)}</div></section>

    {priority ? <SmartCard actionLabel="Abrir proyecto" className="border-brand/25" icon={<Sparkles aria-hidden="true" className="size-5 text-brand" />} onAction={() => location.assign(`/projects/${priority.id}`)} primaryValue={priority.nextAction ?? "Revisar proyecto"} secondaryValue={`${priority.client.name} · ${priority.stage ?? priority.status}`} status={<StatusBadge label="Una recomendación" variant={priority.health === "Critical" ? "danger" : "info"} />} title="ORBIT NOVA" /> : <SmartCard icon={<Sparkles aria-hidden="true" className="size-5" />} primaryValue="Sin decisiones operacionales pendientes" secondaryValue="Cuando exista un proyecto confirmado, ORBIT mostrará aquí la siguiente acción." title="ORBIT NOVA" />}

    <section className="space-y-5"><SectionTitle description="Eventos registrados para la jornada actual." title="Trabajo de hoy" /><div className="grid gap-4 xl:grid-cols-3">{todayProjects.map((project) => <ProjectCard assignments={assignments} key={project.id} project={project} />)}{!todayProjects.length && <SmartCard icon={<CalendarDays aria-hidden="true" className="size-5" />} primaryValue="No hay eventos registrados para hoy" secondaryValue="Los eventos confirmados para esta fecha aparecerán automáticamente." title="Jornada operacional" />}</div></section>

    <section className="space-y-5"><SectionTitle description="Próximos proyectos con fecha confirmada en ORBIT." title="Próximos eventos" /><div className="grid gap-4 xl:grid-cols-3">{upcoming.slice(0, 6).map((project) => <ProjectCard assignments={assignments} key={project.id} project={project} />)}{!upcoming.length && <SmartCard icon={<CalendarCheck2 aria-hidden="true" className="size-5" />} primaryValue="Aún no hay próximos eventos" secondaryValue="Confirma un proyecto para incorporarlo al calendario operacional." title="Planificación" />}</div></section>

    <section className="grid gap-4 sm:grid-cols-3"><SmartCard icon={<UserCheck aria-hidden="true" className="size-5" />} primaryValue={staffCount.toString()} secondaryValue="Perfiles activos registrados" title="Staff" /><SmartCard icon={<CalendarCheck2 aria-hidden="true" className="size-5" />} primaryValue={assignments.length.toString()} secondaryValue="Asignaciones vigentes" title="Asignaciones" /><SmartCard icon={<Clock3 aria-hidden="true" className="size-5" />} primaryValue="Conexión pendiente" secondaryValue="Google OAuth aún no está configurado" status={<StatusBadge label="No disponible" variant="warning" />} title="Google Workspace" /></section>
  </div>;
}
