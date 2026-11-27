import { notFound } from "next/navigation";
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
  return <PdfViewer title="Documento del evento" src={src} download={`${src}?download=1`} fallback={fallback} explicitReturn={explicitReturn} />;
}
