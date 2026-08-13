import { cn } from "@/lib/utils";

export interface SectionTitleProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionTitle({ title, description, action, className }: SectionTitleProps) {
  return <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}><div className="min-w-0"><h2 className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{title}</h2>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>}</div>{action}</div>;
}
