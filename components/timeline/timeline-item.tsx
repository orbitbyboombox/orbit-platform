import { cn } from "@/lib/utils";

export interface TimelineItemProps {
  title: string;
  description?: string;
  timestamp?: string;
  icon?: React.ReactNode;
  isLast?: boolean;
  className?: string;
}

export function TimelineItem({ title, description, timestamp, icon, isLast, className }: TimelineItemProps) {
  return <div className={cn("relative flex gap-3 pb-6", isLast && "pb-0", className)}>{!isLast && <span aria-hidden="true" className="absolute left-[17px] top-9 h-[calc(100%-1.5rem)] w-px bg-border" />}<span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted">{icon ?? <span className="size-2 rounded-full bg-muted" />}</span><div className="min-w-0 pt-1"><div className="flex flex-wrap items-baseline gap-x-3"><h3 className="text-sm font-medium">{title}</h3>{timestamp && <time className="text-xs text-muted">{timestamp}</time>}</div>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div></div>;
}
