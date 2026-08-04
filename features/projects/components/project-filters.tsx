import { cn } from "@/lib/utils";
import type { ProjectFilter } from "../types/project";

const filters: ProjectFilter[] = ["All", "Active", "Upcoming", "Completed", "Archived"];

export interface ProjectFiltersProps {
  activeFilter: ProjectFilter;
  onChange: (filter: ProjectFilter) => void;
}

export function ProjectFilters({ activeFilter, onChange }: ProjectFiltersProps) {
  return <div aria-label="Filter projects" className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1" role="group">{filters.map((filter) => <button aria-pressed={activeFilter === filter} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2", activeFilter === filter && "bg-accent text-foreground")} key={filter} onClick={() => onChange(filter)} type="button">{filter}</button>)}</div>;
}
