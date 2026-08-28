"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Contact, PlusCircle } from "lucide-react";
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
            isActive && "border border-brand/20 bg-[linear-gradient(90deg,rgba(255,149,0,.20),rgba(255,149,0,.08))] text-foreground shadow-[0_10px_30px_rgba(255,149,0,.08)]",
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
    <aside className={cn("peer fixed inset-y-0 left-0 z-30 hidden w-20 border-r border-border/70 bg-[#090c11]/97 shadow-[14px_0_48px_rgba(0,0,0,.2)] backdrop-blur-xl transition-[width] duration-200 md:flex md:flex-col", collapsed ? "lg:w-20" : "lg:w-[15.25rem]")} data-collapsed={collapsed}>
      <div className="relative flex h-[4.5rem] items-center justify-center border-b border-border/70 px-3">
      <Link aria-label="Ir al Dashboard" className="flex h-11 items-center justify-center px-1 lg:px-3" href="/operations">
        <BrandLogo className={cn("w-full max-w-[10.5rem]", collapsed ? "hidden" : "hidden lg:block")} surface="dark" />
        <BrandLogo className={cn("w-full max-w-[2.25rem]", collapsed ? "lg:block" : "lg:hidden")} surface="dark" variant="isotype" />
      </Link>
      <button aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"} className="absolute -right-3 top-1/2 hidden size-7 -translate-y-1/2 place-items-center rounded-full border bg-card text-muted shadow-md transition hover:border-brand/40 hover:text-brand lg:grid" onClick={() => setCollapsed(value => !value)} type="button">{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}</button>
      </div>
      <div className="px-3 pb-3 pt-5"><NavigationList compact hiddenNavigation={hiddenNavigation} iconOnly={collapsed} navigationOrder={navigationOrder} /></div>
      <div className={cn("mx-3 mt-3 border-t pt-4", collapsed && "lg:hidden")}>
        <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[.12em] text-muted">Accesos rápidos</p>
        <nav aria-label="Accesos rápidos" className="space-y-1">
          {[{label:"Nuevo Evento",href:"/projects?reservation=new",icon:PlusCircle},{label:"Buscar Cliente",href:"/customers",icon:Contact},{label:"Calendario",href:"/events",icon:CalendarDays},{label:"Cobros pendientes",href:"/finance/receivables",icon:CircleDollarSign}].map(item=><Link className="group flex min-h-9 items-center gap-3 rounded-xl px-2 text-xs text-muted transition hover:bg-accent/70 hover:text-foreground" href={item.href} key={item.label}><item.icon className="size-4 transition group-hover:text-brand"/><span>{item.label}</span></Link>)}
        </nav>
      </div>
      <div className="mt-auto border-t px-4 py-5 text-center lg:text-left"><Link aria-label="Ir al Dashboard" href="/operations">{collapsed ? <BrandLogo className="mx-auto size-7" surface="dark" variant="isotype" /> : <><BrandSignature className="hidden lg:block" /><BrandLogo className="mx-auto size-7 lg:hidden" surface="dark" variant="isotype" /></>}</Link></div>
    </aside>
  );
}
