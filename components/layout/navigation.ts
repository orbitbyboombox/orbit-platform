import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  Layers3,
  ReceiptText,
  Settings,
  UsersRound,
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
  key: NavigationKey;
  label: string;
  href: string;
  icon: LucideIcon;
  module: OrbitModuleKey;
}

export type NavigationKey =
  | "HOME"
  | "CUSTOMERS"
  | "COMMERCIAL"
  | "EVENTS"
  | "STAFF"
  | "RESOURCES"
  | "FINANCE"
  | "RECEIVABLES"
  | "PAYABLES"
  | "REPORTS"
  | "SETTINGS";

export const navigationItems: readonly NavigationItem[] = [
  {
    key: "HOME",
    label: "Escritorio",
    href: "/operations",
    icon: Gauge,
    module: "DASHBOARD",
  },
  {
    key: "CUSTOMERS",
    label: "Clientes",
    href: "/customers",
    icon: FolderKanban,
    module: "PROJECTS",
  },
  {
    key: "COMMERCIAL",
    label: "Cotizar",
    href: "/leads",
    icon: ReceiptText,
    module: "COMMERCIAL",
  },
  {
    key: "EVENTS",
    label: "Eventos",
    href: "/events",
    icon: CalendarDays,
    module: "PROJECTS",
  },
  {
    key: "STAFF",
    label: "Staff",
    href: "/resources/staff",
    icon: UsersRound,
    module: "STAFF",
  },
  {
    key: "RESOURCES",
    label: "Recursos",
    href: "/resources",
    icon: Layers3,
    module: "RESOURCES",
  },
  {
    key: "FINANCE",
    label: "Finanzas",
    href: "/finance",
    icon: CircleDollarSign,
    module: "FINANCE",
  },
  {
    key: "RECEIVABLES",
    label: "Cuentas por Cobrar",
    href: "/finance/receivables",
    icon: ReceiptText,
    module: "FINANCE",
  },
  {
    key: "PAYABLES",
    label: "Cuentas por Pagar",
    href: "/finance/payables",
    icon: ReceiptText,
    module: "FINANCE",
  },
  {
    key: "REPORTS",
    label: "Reportes",
    href: "/reports",
    icon: BarChart3,
    module: "REPORTS",
  },
  {
    key: "SETTINGS",
    label: "Configuración",
    href: "/settings",
    icon: Settings,
    module: "DASHBOARD",
  },
];
