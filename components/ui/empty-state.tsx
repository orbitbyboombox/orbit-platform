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
  return <div className={cn("orbit-enter flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center", className)}>{Icon && <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent"><Icon aria-hidden="true" className="size-5 text-muted" /></span>}<h3 className="text-lg font-semibold tracking-tight">{title}</h3>{description && <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>}{action && <div className="mt-6">{action}</div>}</div>;
}
