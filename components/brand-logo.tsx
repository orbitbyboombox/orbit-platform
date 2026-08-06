import Image from "next/image";
import { cn } from "@/lib/utils";
import officialOrbitLogo from "@/public/branding/ORBIT V1-0 SINFONDO.png";
import officialOrbitIsotype from "@/public/branding/orbit-isotype.png";

export interface BrandLogoProps {
  variant?: "horizontal" | "isotype";
  surface?: "auto" | "dark" | "light";
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ variant = "horizontal", surface = "auto", className, priority }: BrandLogoProps) {
  const isIsotype = variant === "isotype";
  return (
    <span aria-label={isIsotype ? "ORBIT" : "ORBIT v1.0 · Developed by BOOMBOX · Powered by NOVA CORE"} className={cn("relative block h-auto min-h-8 shrink-0", isIsotype ? "aspect-square" : "aspect-[1224/315]", className)} data-surface={surface} data-variant={variant} role="img">
      <Image alt="" className="object-contain" fill priority={priority} sizes={isIsotype ? "72px" : "(max-width: 768px) 320px, 400px"} src={isIsotype ? officialOrbitIsotype : officialOrbitLogo} />
    </span>
  );
}
