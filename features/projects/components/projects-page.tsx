"use client";

import { ArrowRight, CircleDollarSign, Clock3, FolderKanban, Plus, TrendingUp, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/forms/search-bar";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Project, ProjectFilter } from "../types/project";
import { createCustomerProjectAction } from "../actions/customer.actions";
import { NewProjectDrawer, type ReservationCommercialPrice, type ReservationService, type ReservationVenue } from "./new-project-drawer";
import { ProjectCard } from "./project-card";
import { ProjectFilters } from "./project-filters";

export function ProjectsPage({ canNegotiate, commercialPrices, initialProjects, municipalities, services, venues }: { canNegotiate: boolean; commercialPrices: ReservationCommercialPrice[]; initialProjects: Project[]; municipalities: ActiveMunicipality[]; services: ReservationService[]; venues: ReservationVenue[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<ProjectFilter>("All");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("reservation") === "new") setDrawerOpen(true); }, []);
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const eventType = project.type === "Wedding" ? "Matrimonio" : project.type === "Corporate" ? "Corporativo Empresa" : project.type === "Birthday" ? "Cumpleaños" : project.type === "Graduation" ? "Graduación" : project.type === "Private" ? "Fiesta Privado" : "Otro";
    return (filter === "All" || project.commercialStage === filter) && `${project.name} ${project.client.name} ${project.client.company ?? ""} ${project.client.phone} ${eventType} ${project.event.city}`.toLowerCase().includes(query.toLowerCase());
  }), [filter, projects, query]);
  const relationshipSummary = useMemo(() => {
    const newRelationships = projects.filter(({ commercialStage }) => commercialStage === "New").length;
    const quotations = projects.filter(({ commercialStage }) => commercialStage === "Quoting").length;
    const followUps = projects.filter(({ commercialStage }) => commercialStage === "Waiting").length;
    const converted = projects.filter(({ commercialStage }) => ["Reserved", "Confirmed", "Production", "Finished"].includes(commercialStage)).length;
    const conversion = projects.length ? Math.round((converted / projects.length) * 100) : 0;
    return { newRelationships, quotations, followUps, conversion };
  }, [projects]);

  const addProject = async (draft: Parameters<typeof createCustomerProjectAction>[0]) => {
    const result = await createCustomerProjectAction(draft);
    if (!result.ok) throw new Error(result.error);
    const project = result.project;
    setProjects((current) => [project, ...current]);
    setFilter("All");
    setQuery("");
    return project;
  };

  const openProject = (project: Project) => router.push(`/projects/${project.id}`);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Centro de relaciones</p>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Clientes</h1><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-muted">{projects.length} relaciones activas</span></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Cada conversación, evento y documento reunido en una sola relación continua.</p>
        </div>
        <ActionButton className="w-full sm:w-auto" icon={Plus} label="Nueva reserva" onClick={() => setDrawerOpen(true)} />
      </section>

      <section aria-label="Resumen de relaciones" className="hidden overflow-hidden rounded-2xl border bg-card sm:grid sm:grid-cols-2 xl:grid-cols-4">
        {[{ icon: UserPlus, value: relationshipSummary.newRelationships.toString(), label: "Nuevas relaciones", detail: "Relaciones nuevas" }, { icon: CircleDollarSign, value: relationshipSummary.quotations.toString(), label: "Cotizaciones pendientes", detail: "Requieren propuesta" }, { icon: Clock3, value: relationshipSummary.followUps.toString(), label: "Seguimientos", detail: "Requieren atención" }, { icon: TrendingUp, value: `${relationshipSummary.conversion}%`, label: "Conversión estimada", detail: "Relaciones confirmadas" }].map(({ icon: Icon, value, label, detail }) => <div className="border-b p-5 last:border-b-0 sm:border-r sm:[&:nth-child(2)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2)]:border-r" key={label}><div className="flex items-center justify-between"><Icon aria-hidden="true" className="size-4 text-muted" /><ArrowRight aria-hidden="true" className="size-3.5 text-muted" /></div><p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>)}
      </section>
      <section aria-label="Resumen compacto de relaciones" className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card sm:hidden">
        {[{ value: relationshipSummary.newRelationships.toString(), label: "Nuevos" }, { value: relationshipSummary.quotations.toString(), label: "Cotizaciones" }, { value: relationshipSummary.followUps.toString(), label: "Seguimientos" }].map((item) => <div className="px-3 py-3.5 text-center" key={item.label}><p className="text-lg font-semibold">{item.value}</p><p className="mt-0.5 truncate text-[0.6875rem] text-muted">{item.label}</p></div>)}
      </section>

      <section aria-label="Búsqueda y filtros" className="space-y-3">
        <SearchBar aria-label="Buscar clientes" clearLabel="Limpiar búsqueda" className="h-12" onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar cliente, proyecto, ciudad, teléfono o tipo de evento..." value={query} />
        <ProjectFilters activeFilter={filter} onChange={setFilter} />
      </section>

      {visibleProjects.length > 0 ? (
        <section aria-label="Lista de clientes" className="grid gap-5 xl:grid-cols-2">
          {visibleProjects.map((project) => <ProjectCard key={project.id} onDeleted={(projectId)=>setProjects(current=>current.filter(item=>item.id!==projectId))} onOpen={openProject} project={project} />)}
        </section>
      ) : (
        <EmptyState action={<ActionButton icon={Plus} label="Nueva reserva" onClick={() => setDrawerOpen(true)} />} className="py-20" description={query ? "Prueba con un nombre, proyecto, ciudad, teléfono o tipo de evento." : "Crea la primera reserva para comenzar."} icon={FolderKanban} title={query ? "No encontramos clientes" : "Aún no tienes reservas"} />
      )}

      <NewProjectDrawer canNegotiate={canNegotiate} commercialPrices={commercialPrices} existingCustomers={projects.map(({client})=>client)} municipalities={municipalities} onClose={() => setDrawerOpen(false)} onCreate={addProject} open={drawerOpen} services={services} venues={venues} />
    </div>
  );
}
