"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
  onClear?: () => void;
}

export function SearchBar({ className, onClear, value, ...props }: SearchBarProps) {
  const hasValue = typeof value === "string" && value.length > 0;
  return <label className={cn("flex h-9 w-full items-center gap-2 rounded-md border bg-card px-3 text-muted focus-within:ring-2", className)}><Search aria-hidden="true" className="size-4 shrink-0" /><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted" type="search" value={value} {...props} />{hasValue && onClear && <Button aria-label="Clear search" className="size-6" onClick={onClear} size="icon" type="button" variant="ghost"><X className="size-3.5" /></Button>}</label>;
}
