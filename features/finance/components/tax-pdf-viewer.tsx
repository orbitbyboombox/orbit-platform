"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

type Page = { url: string; width: number; height: number };

export function TaxPdfViewer({ src, download, returnTo }: { src: string; download: string; returnTo: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let documentTask: PDFDocumentLoadingTask | undefined;
    let renderTask: RenderTask | undefined;
    let active = true;
    const urls: string[] = [];

    async function load() {
      const [response, pdf] = await Promise.all([
        fetch(src, { cache: "no-store", signal: controller.signal }),
        import("pdfjs-dist"),
      ]);
      if (!response.ok) throw new Error("El PDF no está disponible.");
      const data = new Uint8Array(await response.arrayBuffer());
      if (!active) return;
      pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      documentTask = pdf.getDocument({ data, isEvalSupported: false });
      const document = await documentTask.promise;
      const rendered: Page[] = [];
      for (let number = 1; number <= document.numPages && active; number++) {
        const page = await document.getPage(number);
        if (!active) break;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error("No se pudo representar el PDF.");
        renderTask = page.render({ canvasContext, viewport });
        await renderTask.promise;
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (!active) break;
        if (!blob) throw new Error("No se pudo representar una página del PDF.");
        const url = URL.createObjectURL(blob);
        urls.push(url);
        rendered.push({ url, width: canvas.width, height: canvas.height });
      }
      if (active) setPages(rendered);
    }
    void load().catch(() => {
      if (active) setError("No se pudo representar el documento. Puedes abrir o descargar el original.");
    });
    return () => {
      active = false;
      controller.abort();
      renderTask?.cancel();
      void documentTask?.destroy().catch(() => undefined);
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [src]);

  async function print() {
    setPrinting(true);
    try {
      const paper = window.document.querySelectorAll<HTMLImageElement>("[data-orbit-tax-print] img");
      await Promise.all(Array.from(paper, image => image.decode()));
      window.print();
    } catch {
      setError("No se pudo preparar la impresión. Abre el PDF original para imprimirlo desde tu lector.");
    } finally {
      setPrinting(false);
    }
  }

  const page = pages[index];
  return <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-6xl p-3 sm:p-5">
    <header className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
      <Link className="rounded-lg px-3 py-2 font-semibold text-brand" href={returnTo}>← Regresar al registro tributario</Link>
      <a className="rounded-lg border px-3 py-2" href={src} target="_blank" rel="noreferrer">Abrir PDF original</a>
      <a className="rounded-lg border px-3 py-2" href={download} download>Descargar</a>
      <button className="rounded-lg border px-3 py-2 disabled:opacity-40" type="button" onClick={print} disabled={!page || printing}>Imprimir</button>
    </header>
    {error && <p role="alert" className="p-3 text-sm">{error}</p>}
    {!page && !error && <p role="status" className="p-3 text-sm">Cargando PDF…</p>}
    {page && <>
      <nav aria-label="Páginas del documento" className="flex flex-wrap items-center justify-center gap-3 p-3">
        <button className="rounded-lg border px-3 py-2 disabled:opacity-40" type="button" onClick={() => setIndex(index - 1)} disabled={!index}>Anterior</button>
        <span aria-live="polite">Página {index + 1} de {pages.length}</span>
        <button className="rounded-lg border px-3 py-2 disabled:opacity-40" type="button" onClick={() => setIndex(index + 1)} disabled={index + 1 === pages.length}>Siguiente</button>
      </nav>
      {/* eslint-disable-next-line @next/next/no-img-element -- PDF pages are rendered to local object URLs. */}
      <img className="mx-auto block h-auto max-w-full rounded border bg-white" src={page.url} width={page.width} height={page.height} alt={`PDF original, página ${index + 1}`} />
      {createPortal(<div data-orbit-tax-print aria-hidden="true">
        <style>{`
          @media screen { [data-orbit-tax-print] { display: none; } }
          @media print {
            body > :not([data-orbit-tax-print]) { display: none !important; }
            html, body { margin: 0 !important; overflow: visible !important; background: white !important; }
            [data-orbit-tax-print] img { display: block; width: auto; height: auto; max-width: 100%; max-height: 240mm; margin: auto; break-inside: avoid; }
            [data-orbit-tax-print] img:not(:last-child) { break-after: page; }
          }
        `}</style>
        {pages.map(item => (
          // eslint-disable-next-line @next/next/no-img-element -- Print the rendered PDF pages in order.
          <img key={item.url} src={item.url} alt="" width={item.width} height={item.height} />
        ))}
      </div>, window.document.body)}
    </>}
  </main>;
}
