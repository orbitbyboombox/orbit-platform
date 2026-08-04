import { BarChart3, BriefcaseBusiness, CircleDollarSign, FolderKanban, Gauge, Layers3, Settings, UsersRound, type LucideIcon } from "lucide-react";
import type { NavigationLabel } from "@/components/layout/navigation";

export interface ModuleDefinition {
  title: NavigationLabel;
  subtitle: string;
  icon: LucideIcon;
}

export const modules: Record<NavigationLabel, ModuleDefinition> = {
  Dashboard: { title: "Dashboard", subtitle: "Your ORBIT workspace overview.", icon: Gauge },
  Projects: { title: "Projects", subtitle: "Project workspace foundation.", icon: FolderKanban },
  Leads: { title: "Leads", subtitle: "Lead workspace foundation.", icon: UsersRound },
  Operations: { title: "Operations", subtitle: "Operations workspace foundation.", icon: BriefcaseBusiness },
  Resources: { title: "Resources", subtitle: "Resource workspace foundation.", icon: Layers3 },
  Finance: { title: "Finance", subtitle: "Finance workspace foundation.", icon: CircleDollarSign },
  Reports: { title: "Reports", subtitle: "Reporting workspace foundation.", icon: BarChart3 },
  Settings: { title: "Settings", subtitle: "Platform settings foundation.", icon: Settings },
};
