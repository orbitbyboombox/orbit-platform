"use client";

import { ArrowLeft, Download, X } from "lucide-react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = { title: string; src: string; onClose: () => void };

// pdfjs-dist ships its worker with the app, avoiding a third-party PDF service.
GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export function SettlementPdfViewer({ title, src, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    const controller = new AbortController();
    setBusy(true);
    fetch(src, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo abrir el PDF.");
        return response.arrayBuffer();
      })
      .then((data) => getDocument({ data: new Uint8Array(data) }).promise)
      .then((document) => {
        loaded = document;
        if (active) { setPdf(document); setPage(1); setBusy(false); }
        else void document.destroy();
      })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "No se pudo abrir el PDF.");
          setBusy(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (loaded) void loaded.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (!pdf || !container.current) return;
    let active = true;
    let renderTasks: Array<{ cancel: () => void }> = [];
    const render = async () => {
      renderTasks.forEach((task) => task.cancel());
      renderTasks = [];
      const width = Math.max(280, container.current?.clientWidth ?? 390);
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (!active) return;
        const pageProxy = await pdf.getPage(index);
        const base = pageProxy.getViewport({ scale: 1 });
        const viewport = pageProxy.getViewport({ scale: Math.min((width - 24) / base.width, 1.8) });
        const target = pageRefs.current[index - 1];
        const canvas = target?.querySelector("canvas");
        if (!canvas) continue;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const task = pageProxy.render({ canvasContext: context, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
        renderTasks.push(task);
        await task.promise;
      }
    };
    void render().catch(() => { if (active) setError("No se pudo representar una página del PDF."); });
    const observer = new ResizeObserver(() => { if (active) void render(); });
    observer.observe(container.current);
    return () => { active = false; observer.disconnect(); renderTasks.forEach((task) => task.cancel()); };
  }, [pdf]);

  const goToPage = useCallback((next: number) => {
    if (!pdf) return;
    const bounded = Math.max(1, Math.min(pdf.numPages, next));
    setPage(bounded);
    pageRefs.current[bounded - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pdf]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goToPage(page + 1);
      if (event.key === "ArrowLeft") goToPage(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKey); };
  }, [goToPage, onClose, page]);

  return <div aria-label={title} aria-modal="true" className="fixed inset-0 z-[220] flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#111214] text-white" role="dialog">
    <header className="z-10 flex min-h-14 shrink-0 items-center gap-1 border-b border-white/10 bg-[#17181a] px-2 pt-[env(safe-area-inset-top)] sm:gap-2 sm:px-4">
      <button className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-orange-400 sm:px-3 sm:text-sm" onClick={onClose} type="button"><ArrowLeft className="size-4"/><span>VOLVER A ORBIT</span></button>
      <p className="min-w-0 flex-1 truncate px-1 text-center text-xs font-medium text-white/80 sm:text-sm">{title}</p>
      <a aria-label="Descargar PDF" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold text-orange-400 sm:gap-2 sm:px-3 sm:text-sm" download href={`${src}${src.includes("?") ? "&" : "?"}download=1`}><Download className="size-4"/><span>DESCARGAR PDF</span></a>
      <button aria-label="Cerrar PDF" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold text-white/80 hover:bg-white/10 sm:gap-2 sm:px-3 sm:text-sm" onClick={onClose} type="button"><X className="size-4"/><span>CERRAR PDF</span></button>
    </header>
    <nav aria-label="Navegación de páginas PDF" className="flex shrink-0 items-center justify-center gap-4 border-b border-white/10 bg-[#17181a] px-3 py-2">
      <button className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold disabled:opacity-40" disabled={page <= 1 || !pdf} onClick={() => goToPage(page - 1)} type="button">‹ Anterior</button>
      <span aria-live="polite" className="min-w-24 text-center text-sm tabular-nums">{pdf ? `Página ${page} de ${pdf.numPages}` : "PDF"}</span>
      <button className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold disabled:opacity-40" disabled={!pdf || page >= pdf.numPages} onClick={() => goToPage(page + 1)} type="button">Siguiente ›</button>
    </nav>
    <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain bg-[#252628] px-2 py-3 [-webkit-overflow-scrolling:touch]" onScroll={() => {
      const host = container.current;
      if (!host) return;
      const midpoint = host.getBoundingClientRect().top + host.clientHeight * 0.35;
      let visible = 1;
      pageRefs.current.forEach((item, index) => { if (item && item.getBoundingClientRect().top <= midpoint) visible = index + 1; });
      setPage((current) => current === visible ? current : visible);
    }}>
      {busy ? <p className="py-10 text-center text-sm text-white/70">Abriendo documento…</p> : null}
      {error ? <p className="py-10 text-center text-sm text-red-300">{error}</p> : null}
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3" ref={container}>
        {pdf ? Array.from({ length: pdf.numPages }, (_, index) => <div className="w-fit max-w-full bg-white shadow-xl" key={index} ref={(element) => { pageRefs.current[index] = element; }}><canvas aria-label={`Página ${index + 1}`} className="block max-w-full"/></div>) : null}
      </div>
    </main>
  </div>;
}
