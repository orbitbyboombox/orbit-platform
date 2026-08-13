import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none", {
  variants: { variant: { default: "bg-brand text-[#111113] shadow-sm hover:-translate-y-px hover:brightness-105 hover:shadow-md", destructive: "bg-danger text-white shadow-sm hover:-translate-y-px hover:brightness-105 hover:shadow-md", ghost: "text-muted hover:bg-accent hover:text-foreground", outline: "border bg-card shadow-sm hover:-translate-y-px hover:border-brand/35 hover:bg-accent/60 hover:shadow-md" }, size: { default: "h-11 px-4", sm: "h-9 px-3 text-xs", icon: "size-10" } },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
