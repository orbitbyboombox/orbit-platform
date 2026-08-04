"use client";

import { CalendarDays, MapPin, MoveUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import type { Project, ProjectCommercialStage, ProjectHealth, ProjectStatus } from "../types/project";

const healthVariants: Record<ProjectHealth, StatusBadgeProps["variant"]> = {
  Healthy: "success",
  Attention: "warning",
  Risk: "danger",
  Critical: "danger",
};

const healthLabels: Record<ProjectHealth, string> = {
  Healthy: "Saludable",
  Attention: "Requiere atención",
  Risk: "En riesgo",
  Critical: "Crítico",
};

const statusLabels: Record<ProjectStatus, string> = {
  Active: "Activo",
  Upcoming: "Próximo",
  Completed: "Completado",
  Archived: "Archivado",
};

const typeLabels: Record<Project["type"], string> = {
  Wedding: "Matrimonio",
  Corporate: "Corporativo",
  Birthday: "Cumpleaños",
  Private: "Privado",
  Other: "Otro",
};

const commercialLabels: Record<ProjectCommercialStage, string> = {
  New: "Nuevo",
  Contacted: "Primer contacto",
  Quoting: "Cotizando",
  Waiting: "Seguimiento",
  Reserved: "Reservado",
  Confirmed: "Confirmado",
  Production: "En producción",
  Finished: "Finalizado",
};

const commercialVariants: Record<ProjectCommercialStage, StatusBadgeProps["variant"]> = {
  New: "info",
  Contacted: "neutral",
  Quoting: "warning",
  Waiting: "warning",
  Reserved: "info",
  Confirmed: "success",
  Production: "success",
  Finished: "neutral",
};

export interface ProjectCardProps {
  project: Project;
  onOpen?: (project: Project) => void;
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const router = useRouter();
  const workspaceHref = `/projects/${project.id}?name=${encodeURIComponent(project.name)}&status=${encodeURIComponent(project.status)}`;

  return (
    <SmartCard className="flex h-full flex-col p-5 sm:p-6" interactive>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{typeLabels[project.type]}</p>
          <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">{project.name}</h2>
          <p className="mt-1 truncate text-sm text-muted">{project.client.name}</p>
        </div>
        <StatusBadge label={commercialLabels[project.commercialStage]} variant={commercialVariants[project.commercialStage]} />
      </div>

      <dl className="mt-6 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays aria-hidden="true" className="size-4" />Fecha del evento</dt>
          <dd className="mt-2 font-medium">{new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${project.event.date}T12:00:00`))}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-xs text-muted"><MapPin aria-hidden="true" className="size-4" />Ciudad</dt>
          <dd className="mt-2 font-medium">{project.event.city}</dd>
        </div>
      </dl>

      <dl className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Estado comercial</dt>
          <dd className="mt-1 font-medium">{commercialLabels[project.commercialStage]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Etapa</dt>
          <dd className="mt-1 font-medium">{project.stage ?? statusLabels[project.status]}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1 sm:text-right">
          <dt className="text-xs text-muted">Puntuación del proyecto</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">{project.score ?? 100}<span className="text-sm font-normal text-muted"> / 100</span></dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="mb-2 text-xs text-muted">Estado</p><div className="flex flex-wrap gap-2"><StatusBadge label={statusLabels[project.status]} variant={project.status === "Active" ? "info" : "neutral"} /><StatusBadge label={healthLabels[project.health]} variant={healthVariants[project.health]} /></div></div>
        <ActionButton className="w-full sm:w-auto" icon={MoveUpRight} iconPosition="end" label="Abrir proyecto" onClick={() => onOpen ? onOpen(project) : router.push(workspaceHref)} />
      </div>
    </SmartCard>
  );
}
