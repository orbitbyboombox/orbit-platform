"use client";

import { ArrowLeft, Download, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

export function QuotePdfViewerPage({
  quoteId,
  quoteNumber,
}: {
  quoteId: string;
  quoteNumber: string;
}) {
  const router = useRouter();
  const detailHref = `/quotes/${encodeURIComponent(quoteId)}`;
  const pdfHref = `/api/commercial/quotes/${encodeURIComponent(quoteId)}/pdf`;
  const downloadHref = `${pdfHref}?download=1`;

  const returnToQuote = () => {
    const expected = new URL(detailHref, window.location.origin);
    const referrer = document.referrer;
    let hasValidPreviousQuote = false;
    if (referrer) {
      try {
        const previous = new URL(referrer);
        hasValidPreviousQuote =
          previous.origin === expected.origin && previous.pathname === expected.pathname;
      } catch {
        hasValidPreviousQuote = false;
      }
    }
    if (hasValidPreviousQuote && window.history.length > 1) router.back();
    else router.push(detailHref);
  };

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col bg-background" data-quote-pdf-viewer>
      <header className="sticky top-0 z-10 flex min-h-16 min-w-0 shrink-0 items-center gap-3 border-b bg-card/95 px-3 shadow-sm backdrop-blur sm:px-6">
        <button
          aria-label="Volver a la cotización"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-brand transition hover:bg-brand/10 sm:px-3"
          onClick={returnToQuote}
          type="button"
        >
          <ArrowLeft className="size-5" />
          <span>VOLVER A LA COTIZACIÓN</span>
        </button>
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <FileText className="size-4 shrink-0 text-brand" />
          <p className="truncate text-sm font-semibold">Cotización {quoteNumber}</p>
        </div>
        <a
          className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition hover:border-brand hover:text-brand sm:px-4 sm:text-sm"
          download
          href={downloadHref}
        >
          <Download className="size-4" />
          <span>DESCARGAR PDF</span>
        </a>
      </header>
      <div className="flex min-h-0 flex-1 bg-white p-1 sm:p-3">
        <iframe
          className="block min-h-[calc(100dvh-5.25rem)] w-full min-w-0 flex-1 border-0 bg-white"
          src={pdfHref}
          title={`PDF cotización ${quoteNumber}`}
        />
      </div>
    </main>
  );
}
