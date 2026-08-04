import { cn } from "@/lib/utils";

export interface SectionTitleProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionTitle({ title, description, action, className }: SectionTitleProps) {
  return <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>{action}</div>;
}
