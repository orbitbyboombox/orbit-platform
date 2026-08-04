import { cn } from "@/lib/utils";

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return <span className={cn("inline-flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background", className)}>{initials}</span>;
}
