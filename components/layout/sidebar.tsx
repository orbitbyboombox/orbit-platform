"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigationItems } from "./navigation";
import { BrandLogo } from "@/components/brand-logo";

export interface NavigationListProps {
  onNavigate?: () => void;
  compact?: boolean;
}

export function NavigationList({ onNavigate, compact }: NavigationListProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="space-y-1">
      {navigationItems.map(({ label, href, icon: Icon }) => {
        const isActive = href === "/" ? pathname === href : pathname.startsWith(href);
        return <Link
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2",
            compact && "justify-center lg:justify-start",
            isActive && "bg-[#ff9500]/15 text-foreground",
          )}
          href={href}
          key={label}
          onClick={onNavigate}
        >
          <Icon aria-hidden="true" className={cn("size-4", isActive && "text-[#ff9500]")} />
          <span className={cn(compact && "hidden lg:inline")}>{label}</span>
        </Link>;
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 border-r bg-card transition-[width] md:flex md:flex-col lg:w-60">
      <Link aria-label="Ir a Inicio" className="flex h-16 items-center justify-center border-b bg-[#080808] px-4 lg:px-5" href="/">
        <BrandLogo className="hidden w-full max-w-[10.5rem] lg:block" surface="dark" />
        <BrandLogo className="size-10 lg:hidden" surface="dark" variant="isotype" />
      </Link>
      <div className="p-3"><NavigationList compact /></div>
      <div className="mt-auto border-t p-4 text-center text-xs text-muted lg:text-left"><Link aria-label="Ir a Inicio" href="/"><span className="hidden lg:inline">ORBIT by BOOMBOX</span><BrandLogo className="mx-auto size-7 lg:hidden" surface="dark" variant="isotype" /></Link></div>
    </aside>
  );
}
