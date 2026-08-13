"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { navigationItems } from "./navigation";
import { BrandLogo } from "@/components/brand-logo";
import { BrandSignature } from "@/components/brand-signature";
import { useModuleManager } from "@/features/module-manager";
import type { NavigationKey } from "./navigation";

export interface NavigationListProps {
  onNavigate?: () => void;
  compact?: boolean;
  navigationOrder?: NavigationKey[];
  hiddenNavigation?: NavigationKey[];
  iconOnly?: boolean;
}

export function NavigationList({ onNavigate, compact, navigationOrder, hiddenNavigation = [], iconOnly = false }: NavigationListProps) {
  const pathname = usePathname();
  const {isEnabled}=useModuleManager();
  return (
    <nav aria-label="Navegación principal" className="space-y-1">
      {[...navigationItems].sort((a,b)=>(navigationOrder?.indexOf(a.key)??0)-(navigationOrder?.indexOf(b.key)??0)).filter(item=>!hiddenNavigation.includes(item.key)&&(item.href==="/settings"||isEnabled(item.module))).map(({ label, href, icon: Icon }) => {
        const isActive = href === "/" ? pathname === href : pathname.startsWith(href);
        return <Link
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted transition-all hover:bg-accent/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            compact && "justify-center lg:justify-start",
            iconOnly && "justify-center px-0",
            isActive && "bg-brand/12 text-foreground shadow-[inset_3px_0_0_var(--brand)]",
          )}
          href={href}
          key={label}
          onClick={onNavigate}
        >
          <Icon aria-hidden="true" className={cn("size-[18px] shrink-0 transition-colors group-hover:text-brand", isActive && "text-brand")} />
          <span className={cn(compact && "hidden lg:inline", iconOnly && "hidden")}>{label}</span>
        </Link>;
      })}
    </nav>
  );
}

export function Sidebar({ navigationOrder, hiddenNavigation }: Pick<NavigationListProps,"navigationOrder"|"hiddenNavigation">) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={cn("peer fixed inset-y-0 left-0 z-30 hidden w-20 border-r bg-card/95 shadow-[8px_0_32px_rgba(0,0,0,.08)] backdrop-blur-xl transition-[width] duration-200 md:flex md:flex-col", collapsed ? "lg:w-20" : "lg:w-60")} data-collapsed={collapsed}>
      <div className="relative flex h-20 items-center justify-center border-b px-2">
      <Link aria-label="Ir al Dashboard" className="flex h-11 items-center justify-center px-1 lg:px-3" href="/operations">
        <BrandLogo className={cn("w-full max-w-[10.5rem]", collapsed ? "hidden" : "hidden lg:block")} surface="dark" />
        <BrandLogo className={cn("w-full max-w-[2.25rem]", collapsed ? "lg:block" : "lg:hidden")} surface="dark" variant="isotype" />
      </Link>
      <button aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"} className="absolute -right-3 top-1/2 hidden size-7 -translate-y-1/2 place-items-center rounded-full border bg-card text-muted shadow-md transition hover:border-brand/40 hover:text-brand lg:grid" onClick={() => setCollapsed(value => !value)} type="button">{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}</button>
      </div>
      <div className="px-3 pb-3 pt-4"><NavigationList compact hiddenNavigation={hiddenNavigation} iconOnly={collapsed} navigationOrder={navigationOrder} /></div>
      <div className="mt-auto border-t px-4 py-5 text-center lg:text-left"><Link aria-label="Ir al Dashboard" href="/operations">{collapsed ? <BrandLogo className="mx-auto size-7" surface="dark" variant="isotype" /> : <><BrandSignature className="hidden lg:block" /><BrandLogo className="mx-auto size-7 lg:hidden" surface="dark" variant="isotype" /></>}</Link></div>
    </aside>
  );
}
