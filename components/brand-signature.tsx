import { cn } from "@/lib/utils";

export function BrandSignature({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <div className={cn("text-[0.75rem] leading-[1.35rem] text-muted", className)}><p className="text-[0.8125rem] font-semibold tracking-wide text-foreground">ORBIT v1.0</p>{!compact && <><p>Developed by BOOMBOX</p><p>Powered by NOVA CORE</p></>}</div>;
}
