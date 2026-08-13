"use client";

import {
  Bell,
  LogOut,
  Menu,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/forms/search-bar";
import { NavigationList } from "./sidebar";
import { signOutAction } from "@/features/authentication/actions/auth.actions";
import { BrandLogo } from "@/components/brand-logo";
import { useModuleManager } from "@/features/module-manager";
import type { NavigationKey } from "./navigation";

export interface HeaderProps {
  userEmail: string;
  userName: string;
  userRole: string;
  unreadNotifications: number;
  navigationOrder: NavigationKey[];
  hiddenNavigation: NavigationKey[];
}

export function Header({ userEmail, userName, userRole, unreadNotifications, navigationOrder, hiddenNavigation }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isEnabled } = useModuleManager();
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center gap-2 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl sm:gap-3 sm:px-4 md:px-6 lg:px-8">
        <Button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar navegación" : "Abrir navegación"}
          className="md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          size="icon"
          variant="ghost"
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <Link
          aria-label="Ir al Dashboard"
          className="flex h-9 w-28 items-center px-2 lg:hidden"
          href="/operations"
        >
          <BrandLogo className="w-full" surface="dark" />
        </Link>
        <SearchBar
          className="ml-auto hidden max-w-[18rem] border-border/80 bg-card/75 md:flex lg:max-w-[22rem] xl:max-w-[24rem]"
          placeholder="Buscar proyectos, clientes o eventos..."
        />
        {isEnabled("OPERATIONS") && <Button
          aria-label={`${unreadNotifications} notificaciones sin leer`}
          asChild
          className="relative"
          size="icon"
          variant="ghost"
        >
          <Link href="/notifications">
            <Bell className="size-4" />
            {unreadNotifications > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
        </Button>}
        <Button
          aria-label="Configuración rápida"
          asChild
          className="hidden sm:inline-flex"
          size="icon"
          variant="ghost"
        >
          <Link href="/settings">
            <Settings2 className="size-4" />
          </Link>
        </Button>
        <span className="mx-1 hidden h-7 w-px bg-border lg:block" aria-hidden="true" />
        <Link aria-label="Abrir perfil del Founder" href="/settings?section=profile">
          <Avatar className="size-10" initials={userEmail.slice(0, 2).toUpperCase()} />
        </Link>
        <div className="hidden min-w-0 pr-1 text-left lg:block">
          <p className="max-w-40 truncate text-xs font-medium">{userName}</p>
          <p className="max-w-40 truncate text-[10px] text-muted">{userRole}</p>
        </div>
        <form action={signOutAction}>
          <Button
            aria-label="Cerrar sesión"
            size="icon"
            type="submit"
            variant="ghost"
          >
            <LogOut className="size-4" />
          </Button>
        </form>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-3 top-[4.75rem] z-40 rounded-2xl border bg-card/95 p-2 shadow-2xl backdrop-blur-xl md:hidden">
          <NavigationList hiddenNavigation={hiddenNavigation} navigationOrder={navigationOrder} onNavigate={() => setMenuOpen(false)} />
        </div>
      )}
    </>
  );
}
