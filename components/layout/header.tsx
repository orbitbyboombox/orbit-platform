"use client";

import { Bell, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/forms/search-bar";
import { NavigationList } from "./sidebar";
import { signOutAction } from "@/features/authentication/actions/auth.actions";

export interface HeaderProps {
  userEmail: string;
}

export function Header({ userEmail }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return <><header className="sticky top-0 z-20 flex h-[3.75rem] items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-6">
    <Button aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"} className="md:hidden" onClick={() => setMenuOpen((open) => !open)} size="icon" variant="ghost">{menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}</Button>
    <div className="flex items-center gap-2 font-semibold md:hidden"><span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-xs text-background">O</span>ORBIT</div>
    <SearchBar className="ml-auto hidden max-w-sm sm:flex" placeholder="Search workspace…" />
    <Button aria-label="Notifications" size="icon" variant="ghost"><Bell className="size-4" /></Button>
    <Button aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} size="icon" variant="ghost">{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
    <div className="hidden min-w-0 text-right lg:block"><p className="truncate text-xs font-medium">Current User</p><p className="max-w-40 truncate text-xs text-muted">{userEmail}</p></div>
    <Avatar initials={userEmail.slice(0, 2).toUpperCase()} />
    <form action={signOutAction}><Button aria-label="Sign out" size="icon" type="submit" variant="ghost"><LogOut className="size-4" /></Button></form>
  </header>{menuOpen && <div className="fixed inset-x-3 top-[4.25rem] z-40 rounded-lg border bg-card p-2 shadow-lg md:hidden"><NavigationList onNavigate={() => setMenuOpen(false)} /></div>}</>;
}
