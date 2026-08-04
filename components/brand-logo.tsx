import Image from "next/image";
import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  variant?: "horizontal" | "isotype";
  surface?: "auto" | "dark" | "light";
  className?: string;
  priority?: boolean;
}

const positionClasses = {
  horizontal: {
    dark: "left-[-23.73%] top-[-132%] w-[142.72%]",
    light: "left-[-22.36%] top-[-126.5%] w-[140.24%]",
  },
  isotype: {
    dark: "left-[-121.4%] top-[-135%] w-[730%]",
    light: "left-[-113.2%] top-[-128%] w-[709.6%]",
  },
} as const;

export function BrandLogo({ variant = "horizontal", surface = "auto", className, priority }: BrandLogoProps) {
  const showLight = surface === "light" || surface === "auto";
  const showDark = surface === "dark" || surface === "auto";
  const sourcePrefix = variant === "horizontal" ? "logo" : "icon";

  return (
    <span aria-label="ORBIT by BOOMBOX" className={cn("relative block shrink-0 overflow-hidden", variant === "horizontal" ? "aspect-[5/1]" : "aspect-square", className)} role="img">
      {showLight && <Image alt="" className={cn("absolute h-auto max-w-none", positionClasses[variant].light, surface === "auto" && "dark:hidden")} height={887} priority={priority} src={`/brand/orbit-${sourcePrefix}-light.png`} unoptimized width={1774} />}
      {showDark && <Image alt="" className={cn("absolute h-auto max-w-none", positionClasses[variant].dark, surface === "auto" && "hidden dark:block")} height={887} priority={priority} src={`/brand/orbit-${sourcePrefix}-dark.png`} unoptimized width={1774} />}
    </span>
  );
}
