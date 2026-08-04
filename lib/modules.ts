import { BarChart3, BriefcaseBusiness, CircleDollarSign, FolderKanban, Gauge, Layers3, Settings, UsersRound, type LucideIcon } from "lucide-react";
import type { NavigationLabel } from "@/components/layout/navigation";

export interface ModuleDefinition {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

export const modules: Record<NavigationLabel, ModuleDefinition> = {
  Dashboard: { title: "Inicio", subtitle: "Tu jornada y las decisiones que requieren atención.", icon: Gauge, emptyTitle: "Tu día está despejado", emptyDescription: "Cuando exista una acción prioritaria, ORBIT la mostrará aquí." },
  Projects: { title: "Proyectos", subtitle: "Gestiona todos tus eventos desde un solo lugar.", icon: FolderKanban, emptyTitle: "Aún no tienes proyectos", emptyDescription: "Crea tu primer proyecto para comenzar." },
  Leads: { title: "Clientes", subtitle: "Encuentra y organiza tus relaciones comerciales.", icon: UsersRound, emptyTitle: "Aún no hay clientes", emptyDescription: "Los clientes asociados a tus proyectos aparecerán aquí." },
  Operations: { title: "Operaciones", subtitle: "Coordina la preparación y ejecución de cada evento.", icon: BriefcaseBusiness, emptyTitle: "No hay operaciones pendientes", emptyDescription: "Las tareas operativas aparecerán cuando un proyecto entre en preparación." },
  Resources: { title: "Recursos", subtitle: "Consulta la disponibilidad de equipos y personas.", icon: Layers3, emptyTitle: "Aún no hay recursos asignados", emptyDescription: "Los equipos y operadores de tus proyectos aparecerán aquí." },
  Finance: { title: "Finanzas", subtitle: "Mantén a la vista pagos, saldos y compromisos.", icon: CircleDollarSign, emptyTitle: "No hay movimientos pendientes", emptyDescription: "Los pagos y saldos de tus proyectos aparecerán aquí." },
  Reports: { title: "Reportes", subtitle: "Revisa el desempeño de tu operación.", icon: BarChart3, emptyTitle: "Aún no hay reportes disponibles", emptyDescription: "Los reportes se generarán cuando exista actividad suficiente." },
  Settings: { title: "Configuración", subtitle: "Administra las preferencias de tu espacio de trabajo.", icon: Settings, emptyTitle: "Todo está configurado", emptyDescription: "Las nuevas preferencias disponibles aparecerán en esta sección." },
};
