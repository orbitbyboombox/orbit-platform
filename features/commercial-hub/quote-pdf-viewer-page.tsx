import { PdfViewer } from "@/features/document-viewer/pdf-viewer";

export function QuotePdfViewerPage({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const id = encodeURIComponent(quoteId);
  const src = `/api/commercial/quotes/${id}/pdf`;
  return <PdfViewer title={`Cotización ${quoteNumber}`} src={src} download={`${src}?download=1`} fallback={`/quotes/${id}`} />;
}
