"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
  onClear?: () => void;
  clearLabel?: string;
  shortcut?: string;
}

export function SearchBar({ className, onClear, clearLabel = "Limpiar búsqueda", shortcut, value, ...props }: SearchBarProps) {
  const hasValue = typeof value === "string" && value.length > 0;
  return <label className={cn("flex h-10 w-full items-center gap-2 rounded-xl border bg-card/80 px-3 text-muted shadow-sm transition-[border-color,box-shadow,background-color] focus-within:border-brand/40 focus-within:bg-card focus-within:ring-2 focus-within:ring-brand/20", className)}><Search aria-hidden="true" className="size-4 shrink-0" /><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted" type="search" value={value} {...props} />{hasValue && onClear && <Button aria-label={clearLabel} className="size-7" onClick={onClear} size="icon" type="button" variant="ghost"><X className="size-3.5" /></Button>}{shortcut&&!hasValue?<kbd className="hidden rounded-md border bg-accent/70 px-1.5 py-1 text-[10px] font-semibold text-muted lg:inline-flex">{shortcut}</kbd>:null}</label>;
}
