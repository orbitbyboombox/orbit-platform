import { cn } from "@/lib/utils";

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return <span className={cn("inline-flex size-9 items-center justify-center rounded-full border border-brand/25 bg-brand/10 text-xs font-semibold text-brand shadow-sm", className)}>{initials}</span>;
}
