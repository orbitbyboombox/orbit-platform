import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("inline-flex min-h-7 items-center rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide", { variants: { variant: { neutral: "border-border/70 bg-accent text-accent-foreground", success: "border-success/15 bg-success-soft text-success", warning: "border-warning/15 bg-warning-soft text-warning", danger: "border-danger/15 bg-danger-soft text-danger", info: "border-info/15 bg-info-soft text-info" } }, defaultVariants: { variant: "neutral" } });

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {
  label: string;
}

export function StatusBadge({ label, variant, className, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>{label}</span>;
}
