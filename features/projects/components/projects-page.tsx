"use client";

import { FolderKanban, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/forms/search-bar";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { initialProjects } from "../data/mock-projects";
import type { Project, ProjectFilter } from "../types/project";
import { NewProjectDrawer } from "./new-project-drawer";
import { ProjectCard } from "./project-card";
import { ProjectFilters } from "./project-filters";

export function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<ProjectFilter>("All");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const visibleProjects = useMemo(() => projects.filter((project) => (filter === "All" || project.status === filter) && `${project.name} ${project.client.name} ${project.event.city}`.toLowerCase().includes(query.toLowerCase())), [filter, projects, query]);
  const addProject = (project: Project) => {
    setProjects((current) => [project, ...current]);
    setFilter("All");
    setQuery("");
    const workspaceQuery = new URLSearchParams({
      name: project.name,
      client: project.client.name,
      type: project.type,
      date: project.event.date,
      time: project.event.time,
      venue: project.event.location,
      city: project.event.city,
      services: project.services.join(","),
    });
    router.push(`/projects/${project.id}?${workspaceQuery.toString()}`);
  };
  const archiveProject = (id: string) => setProjects((current) => current.map((project) => project.id === id ? { ...project, status: "Archived" } : project));
  const duplicateProject = (id: string) => setProjects((current) => { const source = current.find((project) => project.id === id); return source ? [{ ...source, id: `${source.id}-copy-${Date.now()}`, name: `${source.name} Copy`, status: "Upcoming" }, ...current] : current; });

  return <div className="space-y-5"><section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">Projects</h1><span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-muted">{projects.length} projects</span></div><p className="mt-1 text-sm text-muted">Plan, monitor, and open every ORBIT project workspace.</p></div><ActionButton icon={Plus} label="New Project" onClick={() => setDrawerOpen(true)} /></section><section className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto]"><SearchBar aria-label="Global Search" onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Global Search" value={query} /><ProjectFilters activeFilter={filter} onChange={setFilter} /></section>{visibleProjects.length > 0 ? <section aria-label="Project list" className="grid gap-4 xl:grid-cols-2">{visibleProjects.map((project) => <ProjectCard key={project.id} onArchive={archiveProject} onDuplicate={duplicateProject} project={project} />)}</section> : <EmptyState action={<ActionButton icon={Plus} label="New Project" onClick={() => setDrawerOpen(true)} />} description="Create your first project." icon={FolderKanban} title="No projects yet" />}<NewProjectDrawer onClose={() => setDrawerOpen(false)} onCreate={addProject} open={drawerOpen} /></div>;
}
