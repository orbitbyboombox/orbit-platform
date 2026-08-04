import { cn } from "@/lib/utils";
import type { ProjectFilter } from "../types/project";

const filters: ProjectFilter[] = ["All", "New", "Contacted", "Quoting", "Waiting", "Reserved", "Confirmed", "Production", "Finished"];
const filterLabels: Record<ProjectFilter, string> = {
  All: "Todos",
  New: "Nuevos",
  Contacted: "Contactados",
  Quoting: "Cotizando",
  Waiting: "Esperando respuesta",
  Reserved: "Reservados",
  Confirmed: "Confirmados",
  Production: "En producción",
  Finished: "Finalizados",
};

export interface ProjectFiltersProps {
  activeFilter: ProjectFilter;
  onChange: (filter: ProjectFilter) => void;
}

export function ProjectFilters({ activeFilter, onChange }: ProjectFiltersProps) {
  return <div aria-label="Filtrar proyectos" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" role="group">{filters.map((filter) => <button aria-pressed={activeFilter === filter} className={cn("shrink-0 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50", activeFilter === filter && "bg-accent font-medium text-foreground")} key={filter} onClick={() => onChange(filter)} type="button">{filterLabels[filter]}</button>)}</div>;
}
