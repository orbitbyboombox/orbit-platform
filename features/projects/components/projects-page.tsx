"use client";

import { CircleDollarSign, Clock3, FolderKanban, Plus, TrendingUp, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/forms/search-bar";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { initialProjects } from "../data/mock-projects";
import type { Project, ProjectFilter } from "../types/project";
import { NewProjectDrawer } from "./new-project-drawer";
import { ProjectCard } from "./project-card";
import { ProjectFilters } from "./project-filters";
import { QuotationExperience } from "./quotation-experience";
import { SalesFlowExperience } from "./sales-flow-experience";
import type { EventTypeId } from "@/features/business-core";

export function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<ProjectFilter>("All");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [salesProject, setSalesProject] = useState<Project | null>(null);
  const visibleProjects = useMemo(() => projects.filter((project) => (filter === "All" || project.commercialStage === filter) && `${project.name} ${project.client.name} ${project.client.company ?? ""} ${project.event.city}`.toLowerCase().includes(query.toLowerCase())), [filter, projects, query]);

  const addProject = (project: Project) => {
    setProjects((current) => [project, ...current]);
    setFilter("All");
    setQuery("");
    const workspaceQuery = new URLSearchParams({ name: project.name, client: project.client.name, type: project.type, date: project.event.date, time: project.event.time, venue: project.event.location, city: project.event.city, services: project.services.join(",") });
    router.push(`/projects/${project.id}?${workspaceQuery.toString()}`);
  };

  const getEventType = (project: Project): EventTypeId => project.type === "Corporate" ? "COMPANY" : project.type === "Wedding" ? "WEDDING" : project.type === "Birthday" ? "BIRTHDAY" : project.type === "Private" ? "PARTY" : "OTHER";
  const openProject = (project: Project) => {
    if (["New", "Contacted", "Quoting", "Waiting"].includes(project.commercialStage)) setSalesProject(project);
    else router.push(`/projects/${project.id}`);
  };

  if (quotationOpen) return <QuotationExperience onClose={() => setQuotationOpen(false)} />;
  if (salesProject) return <SalesFlowExperience eventType={getEventType(salesProject)} onClose={() => setSalesProject(null)} project={salesProject} />;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Pipeline comercial</p>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Proyectos</h1><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-muted">{projects.length} proyectos</span></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Convierte cada oportunidad en un proyecto confirmado sin duplicar clientes ni perder contexto.</p>
        </div>
        <ActionButton className="w-full sm:w-auto" icon={Plus} label="Nuevo proyecto" onClick={() => setDrawerOpen(true)} />
      </section>

      <section aria-label="Resumen comercial" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmartCard icon={<UserPlus aria-hidden="true" className="size-5" />} primaryValue="3" secondaryValue="Ingresaron esta semana" title="Nuevas oportunidades" />
        <SmartCard icon={<CircleDollarSign aria-hidden="true" className="size-5" />} primaryValue="2" secondaryValue="Requieren una propuesta" title="Cotizaciones pendientes" />
        <SmartCard icon={<Clock3 aria-hidden="true" className="size-5" />} primaryValue="4" secondaryValue="Necesitan seguimiento" title="Esperando respuesta" />
        <SmartCard icon={<TrendingUp aria-hidden="true" className="size-5" />} primaryValue="38%" secondaryValue="Últimos 30 días · datos mock" title="Conversión mensual" />
      </section>

      <OrbitCopilot actionLabel="Enviar catálogo" estimatedTime="20 segundos" impact="El cliente recibe la información oficial necesaria para avanzar." onAction={() => setSalesProject(projects.find((project) => project.id === "boreal-wedding") ?? null)} reason="Josefina + Nicolás corresponden al flujo social." recommendation="Enviar catálogo" title="Siguiente decisión comercial" />

      <section aria-label="Búsqueda y filtros" className="space-y-3">
        <SearchBar aria-label="Buscar proyectos" clearLabel="Limpiar búsqueda" className="h-11" onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar por proyecto, cliente o ciudad..." value={query} />
        <ProjectFilters activeFilter={filter} onChange={setFilter} />
      </section>

      {visibleProjects.length > 0 ? (
        <section aria-label="Lista de proyectos" className="grid gap-5 xl:grid-cols-2">
          {visibleProjects.map((project) => <ProjectCard key={project.id} onOpen={openProject} project={project} />)}
        </section>
      ) : (
        <EmptyState action={<ActionButton icon={Plus} label="Nuevo proyecto" onClick={() => setDrawerOpen(true)} />} className="py-20" description={query ? "Prueba con otro nombre, empresa o ciudad." : "Comienza creando tu primer proyecto."} icon={FolderKanban} title={query ? "No encontramos oportunidades" : "Aún no tienes oportunidades comerciales"} />
      )}

      <NewProjectDrawer onClose={() => setDrawerOpen(false)} onCreate={addProject} open={drawerOpen} />
    </div>
  );
}
