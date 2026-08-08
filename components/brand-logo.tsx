"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useCompanySettings } from "@/features/company-settings";

export interface BrandLogoProps {
  variant?: "horizontal" | "isotype";
  surface?: "auto" | "dark" | "light";
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ variant = "horizontal", surface = "auto", className, priority }: BrandLogoProps) {
  const settings=useCompanySettings();
  const isIsotype = variant === "isotype";
  const configuredSource=(isIsotype?settings.isotypeUrl:settings.logoUrl).replaceAll("%20"," ");
  const fallbackSource=isIsotype?"/branding/orbit-isotype.png":"/branding/ORBIT V1-0 SINFONDO.png";
  const [source,setSource]=useState(configuredSource||fallbackSource);
  useEffect(()=>setSource(configuredSource||fallbackSource),[configuredSource,fallbackSource]);
  return (
    <span aria-label={isIsotype ? settings.productName : `${settings.productName} ${settings.productVersion} · Developed by ${settings.developedBy} · Powered by ${settings.poweredBy}`} className={cn("relative block h-auto min-h-8 shrink-0", isIsotype ? "aspect-square" : "aspect-[1224/315]", className)} data-surface={surface} data-variant={variant} role="img">
      <Image alt="" className="object-contain" fill onError={()=>setSource(fallbackSource)} priority={priority} sizes={isIsotype ? "72px" : "(max-width: 768px) 320px, 400px"} src={source} unoptimized />
    </span>
  );
}
