"use client";

import { CalendarDays, ChevronRight, Clock3, FileText, FolderOpen, History, MessageCircle, MoveUpRight, Pencil, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import type { Project, ProjectCommercialStage } from "../types/project";
import { softDeleteCustomerByProjectAction } from "../actions/customer.actions";

const typeLabels: Record<Project["type"], string> = { Wedding: "Matrimonio", Corporate: "Corporativo", Birthday: "Cumpleaños", Graduation: "Graduación", Private: "Fiesta", Other: "Otro" };
const commercialLabels: Record<ProjectCommercialStage, string> = { New: "Nuevo", Contacted: "Primer contacto", Quoting: "Cotizando", Waiting: "Seguimiento", Reserved: "Reservado", Confirmed: "Confirmado", Production: "Preparación", Finished: "Finalizado" };
const commercialVariants: Record<ProjectCommercialStage, StatusBadgeProps["variant"]> = { New: "info", Contacted: "neutral", Quoting: "warning", Waiting: "warning", Reserved: "info", Confirmed: "success", Production: "success", Finished: "neutral" };
export interface ProjectCardProps { project: Project; onOpen?: (project: Project) => void; onDeleted?: (projectId: string) => void; }

export function ProjectCard({ project, onOpen, onDeleted }: ProjectCardProps) {
  const router = useRouter();
  const href = `/projects/${project.id}`;
  const context = { communication: project.lastCommunication ?? "Sin comunicaciones recientes", owner: project.salesOwner ?? "Sin asignar", action: project.nextAction ?? "Revisar relación", tags: project.tags?.length ? project.tags : [typeLabels[project.type]] };
  const intelligence = ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: project.event.date });
  const remove=async()=>{if(!window.confirm(`¿Eliminar a ${project.client.name}? El cliente quedará archivado y conservará su historial.`))return;const result=await softDeleteCustomerByProjectAction(project.id,"Eliminación confirmada desde Clientes");if(result.ok)onDeleted?.(project.id);else window.alert(result.error??"No fue posible eliminar el cliente.");};

  return (
    <SmartCard className="group flex h-full flex-col overflow-hidden p-0" interactive>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold">{project.client.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span>
            <div className="min-w-0"><h2 className="truncate text-xl font-semibold tracking-tight">{project.client.name}</h2><p className="mt-1 truncate text-sm text-muted">{project.client.company ?? project.name}</p></div>
          </div>
          <StatusBadge label={intelligence.countdown.label} variant={intelligence.countdown.visualState === "RED" ? "danger" : intelligence.countdown.visualState === "ORANGE" || intelligence.countdown.visualState === "YELLOW" ? "warning" : "info"} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">{context.tags.map((tag) => <span className="rounded-full border bg-accent/40 px-2.5 py-1 text-xs text-muted" key={tag}>{tag}</span>)}</div>

        <dl className="mt-5 grid gap-x-6 gap-y-4 border-y py-5 text-sm sm:grid-cols-2">
          <div><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays aria-hidden="true" className="size-3.5" />Próximo evento</dt><dd className="mt-1.5 font-medium">{typeLabels[project.type]} · {ORBIT_TIME_ENGINE.formatDate(new Date(`${project.event.date}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric" })}</dd></div>
          <div><dt className="flex items-center gap-2 text-xs text-muted"><Clock3 aria-hidden="true" className="size-3.5" />Etapa actual</dt><dd className="mt-1.5"><StatusBadge label={commercialLabels[project.commercialStage]} variant={commercialVariants[project.commercialStage]} /></dd></div>
          <div><dt className="flex items-center gap-2 text-xs text-muted"><MessageCircle aria-hidden="true" className="size-3.5" />Última comunicación</dt><dd className="mt-1.5 font-medium">{context.communication}</dd></div>
          <div><dt className="flex items-center gap-2 text-xs text-muted"><UserRound aria-hidden="true" className="size-3.5" />Responsable comercial</dt><dd className="mt-1.5 font-medium">{context.owner}</dd></div>
        </dl>

        <div className="mt-5 rounded-xl bg-accent/55 p-4"><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Próxima acción recomendada</p><div className="mt-2 flex items-center justify-between gap-3"><p className="font-semibold text-brand">{context.action}</p><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand" /></div></div>
      </div>

      <div className="mt-auto border-t bg-accent/20 p-3 sm:p-4">
        <div className="grid grid-cols-4 gap-1 sm:flex sm:items-center">
          <ActionButton className="col-span-4 mb-1 sm:mb-0 sm:mr-auto" icon={MoveUpRight} iconPosition="end" label="Abrir cliente" onClick={() => onOpen ? onOpen(project) : router.push(href)} />
          <Button aria-label="Editar cliente" onClick={() => router.push(`${href}#customer`)} size="icon" title="Editar" variant="ghost"><Pencil aria-hidden="true" className="size-4" /></Button>
          <Button aria-label="Eliminar cliente" onClick={() => void remove()} size="icon" title="Eliminar" variant="ghost"><Trash2 aria-hidden="true" className="size-4" /></Button>
          <Button aria-label="Abrir evento" onClick={() => router.push(href)} size="icon" title="Abrir evento" variant="ghost"><CalendarDays aria-hidden="true" className="size-4" /></Button>
          <Button aria-label="Abrir portal" onClick={() => router.push(`${href}#portal-cliente`)} size="icon" title="Abrir portal" variant="ghost"><FolderOpen aria-hidden="true" className="size-4" /></Button>
          <Button aria-label="Abrir historial" onClick={() => router.push(`${href}#actividad-reciente`)} size="icon" title="Abrir historial" variant="ghost"><History aria-hidden="true" className="size-4" /></Button>
          <Button aria-label="Abrir documentos" onClick={() => router.push(`${href}#documentos`)} size="icon" title="Abrir documentos" variant="ghost"><FileText aria-hidden="true" className="size-4" /></Button>
        </div>
      </div>
    </SmartCard>
  );
}
