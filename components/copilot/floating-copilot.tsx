"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface FloatingCopilotProps {
  children: React.ReactNode;
}

export function FloatingCopilot({ children }: FloatingCopilotProps) {
  const [open, setOpen] = useState(false);

  return <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-6 sm:right-6">
    {open && <div className="mb-3 max-h-[min(58vh,42rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl shadow-2xl sm:max-h-[min(70vh,42rem)]">{children}</div>}
    <Button aria-expanded={open} aria-label={open ? "Cerrar ORBIT Copilot" : "Abrir ORBIT Copilot"} className="ml-auto size-12 rounded-full border-brand/30 bg-card text-brand shadow-xl hover:bg-accent sm:size-14" onClick={() => setOpen((current) => !current)} size="icon" type="button" variant="outline">{open ? <X aria-hidden="true" className="size-5" /> : <Sparkles aria-hidden="true" className="size-5" />}</Button>
  </div>;
}
