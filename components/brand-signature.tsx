"use client";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/features/company-settings";
import { ORBIT_DISPLAY_VERSION } from "@/lib/orbit-version";

export { ORBIT_DISPLAY_VERSION } from "@/lib/orbit-version";

export function BrandSignature({ className, compact = false }: { className?: string; compact?: boolean }) {
  const settings=useCompanySettings();
  return <div className={cn("text-[0.75rem] leading-[1.35rem] text-muted", className)}><p className="text-[0.8125rem] font-semibold tracking-wide text-foreground" data-testid="brand-signature-version">{settings.productName} {ORBIT_DISPLAY_VERSION}</p>{!compact && <><p>Developed by {settings.developedBy}</p><p>Powered by {settings.poweredBy}</p></>}</div>;
}
