"use client";

import { Bell, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/forms/search-bar";
import { NavigationList } from "./sidebar";
import { signOutAction } from "@/features/authentication/actions/auth.actions";
import { BrandLogo } from "@/components/brand-logo";

export interface HeaderProps {
  userEmail: string;
}

export function Header({ userEmail }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <><header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-5 lg:px-6">
    <Button aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar navegación" : "Abrir navegación"} className="md:hidden" onClick={() => setMenuOpen((open) => !open)} size="icon" variant="ghost">{menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}</Button>
    <Link aria-label="Ir a Inicio" className="flex h-9 w-32 items-center rounded-md bg-[#080808] px-2.5 lg:hidden" href="/"><BrandLogo className="w-full" surface="dark" /></Link>
    <SearchBar className="ml-auto hidden max-w-sm sm:flex" placeholder="Buscar proyectos, clientes o eventos..." />
    <Button aria-label="Notificaciones" size="icon" variant="ghost"><Bell className="size-4" /></Button>
    <div className="hidden min-w-0 text-right lg:block"><p className="truncate text-xs font-medium">Usuario actual</p><p className="max-w-40 truncate text-xs text-muted">{userEmail}</p></div>
    <Avatar initials={userEmail.slice(0, 2).toUpperCase()} />
    <form action={signOutAction}><Button aria-label="Cerrar sesión" size="icon" type="submit" variant="ghost"><LogOut className="size-4" /></Button></form>
  </header>{menuOpen && <div className="fixed inset-x-3 top-[4.5rem] z-40 rounded-lg border bg-card p-2 shadow-lg md:hidden"><NavigationList onNavigate={() => setMenuOpen(false)} /></div>}</>;
}
