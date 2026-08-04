import Link from "next/link";
import { Archive, CalendarDays, Copy, MapPin, MoveUpRight } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import type { Project, ProjectHealth } from "../types/project";

const healthVariants: Record<ProjectHealth, StatusBadgeProps["variant"]> = {
  Healthy: "success",
  Attention: "warning",
  Risk: "danger",
  Critical: "danger",
};

export interface ProjectCardProps {
  project: Project;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function ProjectCard({ project, onArchive, onDuplicate }: ProjectCardProps) {
  const workspaceHref = `/projects/${project.id}?name=${encodeURIComponent(project.name)}&status=${encodeURIComponent(project.status)}`;
  return <SmartCard className="flex h-full flex-col" interactive><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-muted">{project.type}</p><h2 className="mt-1 text-lg font-semibold tracking-tight">{project.name}</h2></div><StatusBadge label={project.status} variant={project.status === "Active" ? "info" : "neutral"} /></div><dl className="mt-5 space-y-3 text-sm"><div className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4 text-muted" /><dt className="sr-only">Event date</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${project.event.date}T12:00:00`))}</dd></div><div className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-4 text-muted" /><dt className="sr-only">Location</dt><dd>{project.event.location}, {project.event.city}</dd></div><div><dt className="text-xs text-muted">Services</dt><dd className="mt-1 font-medium">{project.services.join(" · ")}</dd></div><div className="flex items-center justify-between gap-3 border-t pt-3"><dt className="text-xs text-muted">Project health</dt><dd><StatusBadge label={project.health} variant={healthVariants[project.health]} /></dd></div></dl><div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2"><Button asChild className="sm:col-span-2"><Link href={workspaceHref}><span>Open Workspace</span><MoveUpRight aria-hidden="true" className="size-4" /></Link></Button><ActionButton icon={Copy} label="Duplicate" onClick={() => onDuplicate(project.id)} variant="outline" /><ActionButton icon={Archive} label="Archive" onClick={() => onArchive(project.id)} variant="outline" /></div></SmartCard>;
}
