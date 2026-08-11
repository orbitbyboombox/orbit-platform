import {
  BarChart3,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  Layers3,
  ListChecks,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { OrbitModuleKey } from "@/features/module-manager";

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
  module: OrbitModuleKey;
}

export const navigationItems: readonly NavigationItem[] = [
  { label: "Inicio", href: "/operations", icon: Gauge, module:"DASHBOARD" },
  { label: "Clientes", href: "/customers", icon: FolderKanban, module:"PROJECTS" },
  { label: "Tareas", href: "/tasks", icon: ListChecks, module:"OPERATIONS" },
  { label: "Recursos", href: "/resources", icon: Layers3, module:"RESOURCES" },
  { label: "Finanzas", href: "/finance", icon: CircleDollarSign, module:"FINANCE" },
  { label: "Cuentas por Cobrar", href: "/finance/receivables", icon: ReceiptText, module:"FINANCE" },
  { label: "Reportes", href: "/reports", icon: BarChart3, module:"REPORTS" },
  { label: "Configuración", href: "/settings", icon: Settings, module:"DASHBOARD" },
];
