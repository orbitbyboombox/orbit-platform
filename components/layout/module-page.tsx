import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "./section-title";

export interface ModulePageProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

export function ModulePage({ title, subtitle, icon }: ModulePageProps) {
  return <div className="space-y-6"><SectionTitle description={subtitle} title={title} /><EmptyState icon={icon} title="This module is under development." /></div>;
}
