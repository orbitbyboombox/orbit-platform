"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigationItems } from "./navigation";

export interface NavigationListProps {
  onNavigate?: () => void;
}

export function NavigationList({ onNavigate }: NavigationListProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {navigationItems.map(({ label, href, icon: Icon }) => {
        const isActive = href === "/" ? pathname === href : pathname.startsWith(href);
        return <Link
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2",
            isActive && "bg-accent text-foreground",
          )}
          href={href}
          key={label}
          onClick={onNavigate}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span>{label}</span>
        </Link>;
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-card md:flex md:flex-col">
      <div className="flex h-[3.75rem] items-center gap-2 border-b px-5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-xs font-bold text-background">O</span>
        <span className="font-semibold tracking-tight">ORBIT</span>
      </div>
      <div className="p-3"><NavigationList /></div>
      <div className="mt-auto border-t p-4 text-xs text-muted">ORBIT Platform · DEV-003</div>
    </aside>
  );
}
