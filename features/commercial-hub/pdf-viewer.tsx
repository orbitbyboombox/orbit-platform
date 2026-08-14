"use client";

import { ArrowLeft, Download, Share2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PdfViewer({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const share = async () => {
    const url = new URL(src, window.location.origin).toString();
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); setMessage("Enlace copiado."); }
  };
  return <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={title}>
    <header className="flex min-h-16 items-center gap-2 border-b bg-card px-3 sm:px-5">
      <Button onClick={onClose} variant="ghost"><ArrowLeft />Volver a ORBIT</Button>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
      <Button asChild size="icon" variant="ghost"><a aria-label="Descargar PDF" href={`${src}${src.includes("?") ? "&" : "?"}download=1`}><Download /></a></Button>
      <Button aria-label="Compartir PDF" onClick={share} size="icon" variant="ghost"><Share2 /></Button>
      <Button aria-label="Cerrar visor" onClick={onClose} size="icon" variant="ghost"><X /></Button>
    </header>
    {message && <p className="px-4 py-2 text-center text-xs text-success">{message}</p>}
    <iframe className="min-h-0 flex-1 bg-white" src={src} title={title} />
  </div>;
}
