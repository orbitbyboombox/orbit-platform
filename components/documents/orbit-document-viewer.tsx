"use client";

import { ArrowLeft, Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type OrbitDocumentViewerProps = {
  title: string;
  src: string;
  onClose: () => void;
  downloadUrl?: string;
};

export function OrbitDocumentViewer({ title, src, onClose, downloadUrl }: OrbitDocumentViewerProps) {
  const [message, setMessage] = useState("");
  const closeLock = useRef(false);
  const close = () => {
    if (closeLock.current) return;
    closeLock.current = true;
    onClose();
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
    };
  // The viewer mounts for one document session; keeping this cleanup stable prevents
  // scroll-lock teardown/reapply on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const url = new URL(src, window.location.origin).toString();
    if (navigator.share) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado.");
    }
  };
  const resolvedDownload = downloadUrl ?? `${src}${src.includes("?") ? "&" : "?"}download=1`;

  return createPortal(
    <div
      aria-label={title}
      aria-modal="true"
      className="pointer-events-auto fixed inset-0 z-[200] flex h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-background"
      data-orbit-document-viewer
      role="dialog"
    >
      <header className="flex min-h-16 min-w-0 max-w-full shrink-0 items-center gap-1 border-b bg-card px-2 [padding-top:env(safe-area-inset-top)] sm:gap-2 sm:px-5">
        <Button aria-label="Volver al Evento" className="min-h-11 shrink-0 px-2 sm:px-4" onClick={close} variant="ghost">
          <ArrowLeft className="size-5"/><span className="hidden sm:inline">Volver al Evento</span>
        </Button>
        <p className="min-w-0 flex-1 truncate px-1 text-xs font-semibold sm:text-sm">{title}</p>
        <Button asChild className="min-h-11 min-w-11" size="icon" variant="ghost">
          <a aria-label="Descargar documento" href={resolvedDownload}><Download/></a>
        </Button>
        <Button aria-label="Compartir documento" className="hidden min-h-11 min-w-11 sm:inline-flex" onClick={share} size="icon" variant="ghost"><Share2/></Button>
        <Button aria-label="Cerrar y volver al Evento" className="min-h-11 min-w-11" onClick={close} size="icon" variant="ghost"><X/></Button>
      </header>
      {message ? <p className="shrink-0 px-4 py-2 text-center text-xs text-success">{message}</p> : null}
      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-white">
        <iframe className="block h-full min-h-0 w-full max-w-full border-0 bg-white" src={src} title={title}/>
      </div>
    </div>,
    document.body,
  );
}
