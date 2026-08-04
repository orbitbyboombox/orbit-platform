import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "./section-title";

export interface ModulePageProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

export function ModulePage({ title, subtitle, icon, emptyTitle, emptyDescription }: ModulePageProps) {
  return <div className="space-y-8"><SectionTitle description={subtitle} title={title} /><EmptyState description={emptyDescription} icon={icon} title={emptyTitle} /></div>;
}
