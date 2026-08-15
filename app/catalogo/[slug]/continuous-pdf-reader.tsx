"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type PdfDocument = Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>["promise"]>;

export function ContinuousPdfReader({ name, url }: { name: string; url: string }) {
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let current: PdfDocument | null = null;
    void (async () => {
      try {
        setError(""); setProgress(0); setDocument(null);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url });
        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => setProgress(total ? Math.round((loaded / total) * 100) : 0);
        current = await task.promise;
        if (!disposed) setDocument(current);
      } catch (cause) {
        console.error("Public catalog PDF load failed", cause);
        if (!disposed) setError(process.env.NODE_ENV === "development" && cause instanceof Error ? `No fue posible cargar el catálogo. ${cause.message}` : "No fue posible cargar el catálogo.");
      }
    })();
    return () => { disposed = true; if (current) void current.destroy(); };
  }, [attempt, url]);
  if (error) return <div className="rounded-2xl border border-red-400/30 bg-[#101319] p-6 text-center"><p>{error}</p><Button className="mt-4" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div>;
  if (!document) return <div aria-live="polite" className="rounded-2xl border border-white/10 bg-[#101319] p-8 text-center text-white/70">Cargando catálogo…{progress > 0 ? ` ${progress}%` : ""}</div>;
  return <section aria-label={`${name}, ${document.numPages} páginas`} className="space-y-3 sm:space-y-5">
    {Array.from({ length: document.numPages }, (_, index) => <LazyPdfPage document={document} key={index + 1} pageNumber={index + 1} />)}
  </section>;
}

function LazyPdfPage({ document, pageNumber }: { document: PdfDocument; pageNumber: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber === 1);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const element = holder.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "900px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !width || !canvas.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void (async () => {
      try {
        setError(false);
        const page = await document.getPage(pageNumber);
        if (cancelled || !canvas.current) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * outputScale });
        const target = canvas.current;
        target.width = Math.floor(viewport.width); target.height = Math.floor(viewport.height);
        target.style.width = `${width}px`; target.style.height = `${Math.round(width * (base.height / base.width))}px`;
        const context = target.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas unavailable");
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (cause) {
        if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) { console.error(`Catalog page ${pageNumber} failed`, cause); setError(true); }
      }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [attempt, document, pageNumber, visible, width]);
  return <article aria-label={`Página ${pageNumber}`} className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-[0_8px_28px_rgba(0,0,0,.28)]" ref={holder} style={{ aspectRatio: `1 / ${ratio}` }}>
    <canvas aria-label={`Página ${pageNumber} del catálogo`} className={`block max-w-full transition-opacity duration-300 ${visible && !error ? "opacity-100" : "opacity-0"}`} ref={canvas} />
    {!visible && <div className="absolute inset-0 grid place-items-center bg-white text-sm text-black/45">Página {pageNumber}</div>}
    {visible && error && <div className="absolute inset-0 grid place-items-center bg-white p-6 text-center text-black"><div><p>No se pudo mostrar la página {pageNumber}.</p><Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div></div>}
  </article>;
}
