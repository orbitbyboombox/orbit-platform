import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("inline-flex min-h-7 items-center rounded-full border border-transparent px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[.08em]", { variants: { variant: { neutral: "border-border/70 bg-accent/80 text-accent-foreground", success: "border-success/15 bg-success-soft/80 text-success", warning: "border-warning/15 bg-warning-soft/80 text-warning", danger: "border-danger/15 bg-danger-soft/80 text-danger", info: "border-info/15 bg-info-soft/80 text-info" } }, defaultVariants: { variant: "neutral" } });

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {
  label: string;
}

export function StatusBadge({ label, variant, className, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>{label}</span>;
}
