"use client";

import {
  ArrowLeft,
  Bell,
  FolderKanban,
  Gauge,
  LogOut,
  Menu,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  unreadNotifications: number;
  navigationOrder: NavigationKey[];
  hiddenNavigation: NavigationKey[];
}

export function Header({ userEmail, unreadNotifications, navigationOrder, hiddenNavigation }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isEnabled } = useModuleManager();
  const openedFromDashboard =
    searchParams.get("from") === "dashboard" && pathname !== "/operations";
  const eventHref = pathname.startsWith("/projects/") ? pathname : undefined;
  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-5 lg:px-6">
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
          className="flex h-9 w-32 items-center rounded-md bg-[#080808] px-2.5 lg:hidden"
          href="/operations"
        >
          <BrandLogo className="w-full" surface="dark" />
        </Link>
        <nav
          aria-label="Navegación contextual"
          className="ml-1 hidden items-center gap-1 xl:flex"
        >
          {isEnabled("DASHBOARD") && (openedFromDashboard ? (
            <Button asChild className="min-h-9 px-3" variant="ghost">
              <Link href="/operations">
                <ArrowLeft className="mr-1 size-4" />
                Volver al Dashboard
              </Link>
            </Button>
          ) : (
            <Button
              className="min-h-9 px-3"
              onClick={() => router.back()}
              variant="ghost"
            >
              <ArrowLeft className="mr-1 size-4" />
              Atrás
            </Button>
          ))}
          {isEnabled("DASHBOARD") && <Button asChild className="min-h-9 px-3" variant="ghost">
            <Link href="/operations">
              <Gauge className="mr-1 size-4" />
              Dashboard
            </Link>
          </Button>}
          {isEnabled("PROJECTS") && <Button asChild className="min-h-9 px-3" variant="ghost">
            <Link href="/customers">
              <FolderKanban className="mr-1 size-4" />
              Clientes
            </Link>
          </Button>}
          {eventHref && isEnabled("PROJECTS") && (
            <Button asChild className="min-h-9 px-3" variant="ghost">
              <Link href={eventHref}>Evento</Link>
            </Button>
          )}
        </nav>
        <SearchBar
          className="ml-auto hidden max-w-sm sm:flex"
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
        <div className="hidden min-w-0 text-right lg:block">
          <p className="truncate text-xs font-medium">Founder</p>
          <p className="max-w-40 truncate text-xs text-muted">{userEmail}</p>
        </div>
        <Link aria-label="Abrir perfil del Founder" href="/settings?section=profile">
          <Avatar initials={userEmail.slice(0, 2).toUpperCase()} />
        </Link>
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
      <nav
        aria-label="Navegación contextual móvil"
        className="sticky top-16 z-10 flex gap-1 overflow-x-auto border-b bg-background/95 px-3 py-2 backdrop-blur xl:hidden"
      >
        {isEnabled("DASHBOARD") && (openedFromDashboard ? (
          <Button asChild className="min-h-9 shrink-0 px-3" variant="ghost">
            <Link href="/operations">
              <ArrowLeft className="mr-1 size-4" />
              Volver al Dashboard
            </Link>
          </Button>
        ) : (
          <Button
            className="min-h-9 shrink-0 px-3"
            onClick={() => router.back()}
            variant="ghost"
          >
            <ArrowLeft className="mr-1 size-4" />
            Atrás
          </Button>
        ))}
        {isEnabled("DASHBOARD") && <Button asChild className="min-h-9 shrink-0 px-3" variant="ghost">
          <Link href="/operations">
            <Gauge className="mr-1 size-4" />
            Dashboard
          </Link>
        </Button>}
        {isEnabled("PROJECTS") && <Button asChild className="min-h-9 shrink-0 px-3" variant="ghost">
          <Link href="/customers">
            <FolderKanban className="mr-1 size-4" />
            Clientes
          </Link>
        </Button>}
        {eventHref && isEnabled("PROJECTS") && (
          <Button asChild className="min-h-9 shrink-0 px-3" variant="ghost">
            <Link href={eventHref}>Evento</Link>
          </Button>
        )}
      </nav>
      {menuOpen && (
        <div className="fixed inset-x-3 top-[7.5rem] z-40 rounded-lg border bg-card p-2 shadow-lg md:hidden">
          <NavigationList hiddenNavigation={hiddenNavigation} navigationOrder={navigationOrder} onNavigate={() => setMenuOpen(false)} />
        </div>
      )}
    </>
  );
}
