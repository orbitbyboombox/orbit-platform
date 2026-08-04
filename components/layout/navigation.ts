import {
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  Layers3,
  Settings,
  UsersRound,
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
  label: NavigationLabel;
  href: string;
  icon: LucideIcon;
}

export const navigationItems: readonly NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Leads", href: "/leads", icon: UsersRound },
  { label: "Operations", href: "/operations", icon: BriefcaseBusiness },
  { label: "Resources", href: "/resources", icon: Layers3 },
  { label: "Finance", href: "/finance", icon: CircleDollarSign },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];
