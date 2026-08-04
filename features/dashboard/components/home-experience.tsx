"use client";

import { ArrowRight, Banknote, CalendarDays, FilePlus2, FolderPlus, MapPin, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";

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
  const openProject = (id = "matrimonio-silva") => router.push(`/projects/${id}`);

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={
        <section className="overflow-hidden rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Martes, 4 de agosto</p>
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
          <section aria-labelledby="proximo-evento">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Agenda</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="proximo-evento">Próximo evento</h2></div>
              <StatusBadge label="Confirmado" variant="success" />
            </div>
            <SmartCard actionLabel="Abrir proyecto" icon={<CalendarDays aria-hidden="true" className="size-5" />} onAction={() => openProject()} primaryValue="Camila Silva + Tomás Rojas" secondaryValue="Sábado, 17 de octubre de 2026 · 18:30" title="Matrimonio">
              <div className="flex items-start gap-2 text-sm text-muted"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>Casa García-Huidobro · Santiago</span></div>
            </SmartCard>
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
