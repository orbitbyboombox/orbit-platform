import { notFound } from "next/navigation";
import { TaxPdfViewer } from "@/features/finance/components/tax-pdf-viewer";
import { PdfViewer } from "@/features/document-viewer/pdf-viewer";

export default async function ProjectDocumentViewer({ params, searchParams }: {
  params: Promise<{ projectId: string; documentId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { projectId, documentId } = await params;
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (!uuid.test(projectId) || !uuid.test(documentId)) notFound();
  const src = `/api/projects/${projectId}/documents/${documentId}`;
  const { returnTo } = await searchParams;
  let fallback = `/projects/${projectId}?eventTab=DOCUMENTS`;
  let explicitReturn = false;
  if (typeof returnTo === "string" && returnTo.length <= 2048 && returnTo.startsWith("/finance/tributary")) {
    const destination = new URL(returnTo, "https://orbit.invalid");
    if (destination.origin === "https://orbit.invalid" && ["/finance/tributary", "/finance/tributary/accounting", "/finance/tributary/facturas", "/finance/tributary/boletas", "/finance/tributary/guias", "/finance/tributary/notas-credito", "/finance/tributary/notas-debito", "/finance/tributary/archivo"].includes(destination.pathname)) {
      fallback = destination.pathname + destination.search + destination.hash;
      explicitReturn = true;
    }
  }
  if (explicitReturn) return <TaxPdfViewer key={src} src={src} download={`${src}?download=1`} returnTo={fallback} />;
  return <PdfViewer title="Documento del evento" src={src} download={`${src}?download=1`} fallback={fallback} explicitReturn={explicitReturn} />;
}
