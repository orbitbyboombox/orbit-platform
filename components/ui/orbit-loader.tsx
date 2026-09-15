import {cn} from "@/lib/utils";

export type OrbitLoaderVariant = "inline" | "button" | "section" | "fullscreen";

export interface OrbitLoaderProps {
  variant?: OrbitLoaderVariant;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes:Record<OrbitLoaderVariant,string>={
  inline:"size-4",
  button:"size-4",
  section:"size-8",
  fullscreen:"size-10",
};

const customSizes={sm:"size-4",md:"size-8",lg:"size-10"};

export function OrbitLoader({variant="inline",label="Cargando…",className,size}:OrbitLoaderProps){
  const ring=<span aria-hidden="true" className={cn("orbit-loader-ring shrink-0",size?customSizes[size]:sizes[variant])}/>;
  if(variant==="button")return <span aria-hidden="true" className={cn("inline-flex items-center",className)}>{ring}</span>;
  if(variant==="fullscreen")return <div aria-busy="true" aria-live="polite" className={cn("orbit-loader-fullscreen fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/80 px-4 text-center backdrop-blur-[2px]",className)} role="status">{ring}<span className="text-sm font-medium text-foreground">{label}</span></div>;
  if(variant==="section")return <div aria-busy="true" aria-live="polite" className={cn("flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border bg-card/70 p-6 text-center",className)} role="status">{ring}<span className="text-sm text-muted">{label}</span></div>;
  return <span aria-live="polite" className={cn("inline-flex items-center gap-2 text-sm text-muted",className)} role="status">{ring}<span>{label}</span></span>;
}
