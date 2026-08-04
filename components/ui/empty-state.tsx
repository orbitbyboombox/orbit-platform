import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center", className)}>{Icon && <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent"><Icon aria-hidden="true" className="size-5 text-muted" /></span>}<h3 className="font-medium">{title}</h3>{description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
