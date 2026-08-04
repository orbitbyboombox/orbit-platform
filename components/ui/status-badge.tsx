import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", { variants: { variant: { neutral: "bg-accent text-accent-foreground", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" } }, defaultVariants: { variant: "neutral" } });

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {
  label: string;
}

export function StatusBadge({ label, variant, className, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>{label}</span>;
}
