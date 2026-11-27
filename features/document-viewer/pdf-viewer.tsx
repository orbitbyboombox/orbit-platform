"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PdfViewer({ title, src, download, fallback, onClose, explicitReturn = false }: {
  title: string;
  src: string;
  download: string;
  fallback: string;
  onClose?: () => void;
  explicitReturn?: boolean;
}) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [message, setMessage] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "fallback">("loading");
  const ready = loadState !== "loading";

  useEffect(() => {
    setLoadState("loading");
    setMessage("");
    const timeout = window.setTimeout(() => {
      setLoadState("fallback");
      setMessage("El visor no confirmó la carga. Puedes abrir o descargar el PDF original.");
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [src]);

  function close() {
    if (onClose) { onClose(); return; }
    if (explicitReturn) { router.replace(fallback); return; }
    // A direct launch or a link from outside ORBIT must stay inside the app.
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer?.origin === window.location.origin && window.history.length > 1) router.back();
    else router.replace(fallback);
  }

  function print() {
    if (!ready) return;
    setMessage("Si no se abre el diálogo de impresión, descarga el PDF original e imprímelo desde tu lector de PDF.");
    try {
      const pdf = frame.current?.contentWindow;
      if (!pdf) throw new Error();
      pdf.focus();
      pdf.print();
    } catch {
      setMessage("Si tu aplicación no permite imprimir aquí, descarga el PDF y ábrelo para imprimirlo.");
    }
  }

  return <main className="flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col bg-background">
    <header className="sticky top-0 z-20 grid min-w-0 grid-cols-2 gap-2 border-b bg-card p-2 sm:flex sm:items-center sm:px-4">
      <button className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand" type="button" onClick={close}>← Regresar</button>
      <h1 className="hidden min-w-0 flex-1 truncate text-sm font-semibold sm:block">{title}</h1>
      <button className="min-h-11 rounded-lg border px-3 text-sm" type="button" onClick={close}>Cerrar visor</button>
      <a className="flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm" href={download} download>Descargar</a>
      <button className="min-h-11 rounded-lg border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={print} disabled={!ready}>Imprimir</button>
    </header>
    {!ready && <p role="status" className="px-3 py-2 text-sm text-muted">Cargando documento. Puedes abrir o descargar el original mientras se abre el visor.</p>}
    {message && <p role="status" className="px-3 py-2 text-sm">{message}</p>}
    <div className="flex flex-wrap gap-2 px-3 py-2">
      <a className="rounded-lg border px-3 py-2 text-sm font-semibold text-brand" href={src} target="_blank" rel="noopener noreferrer">Abrir PDF original</a>
    </div>
    <iframe key={src} ref={frame} onLoad={() => { setLoadState("ready"); setMessage(""); }} onError={() => { setLoadState("fallback"); setMessage("No fue posible cargar el visor. Usa Abrir PDF original o Descargar."); }} className="block min-h-[70dvh] w-full min-w-0 flex-1 border-0 bg-white" src={src} title={title} />
  </main>;
}
