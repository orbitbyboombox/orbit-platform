"use client";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/features/company-settings";

export function BrandSignature({ className, compact = false, productVersion, developedBy, poweredBy }: { className?: string; compact?: boolean; productVersion?: string; developedBy?: string; poweredBy?: string }) {
  const settings=useCompanySettings();
  return <div className={cn("text-[0.75rem] leading-[1.35rem] text-muted", className)}><p className="text-[0.8125rem] font-semibold tracking-wide text-foreground">{settings.productName} {productVersion ?? settings.productVersion}</p>{!compact && <><p>Developed by {developedBy ?? settings.developedBy}</p><p>Powered by {poweredBy ?? settings.poweredBy}</p></>}</div>;
}
