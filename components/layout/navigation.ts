import {
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  Layers3,
  ListChecks,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavigationLabel =
  | "Dashboard"
  | "Projects"
  | "Leads"
  | "Operations"
  | "Resources"
  | "Finance"
  | "Reports"
  | "Settings";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navigationItems: readonly NavigationItem[] = [
  { label: "Inicio", href: "/", icon: Gauge },
  { label: "Clientes", href: "/projects", icon: FolderKanban },
  { label: "Centro de Comando", href: "/operations", icon: BriefcaseBusiness },
  { label: "Tareas", href: "/tasks", icon: ListChecks },
  { label: "Recursos", href: "/resources", icon: Layers3 },
  { label: "Finanzas", href: "/finance", icon: CircleDollarSign },
  { label: "Cuentas por Cobrar", href: "/finance/receivables", icon: ReceiptText },
  { label: "Reportes", href: "/reports", icon: BarChart3 },
  { label: "Configuración", href: "/settings", icon: Settings },
];
