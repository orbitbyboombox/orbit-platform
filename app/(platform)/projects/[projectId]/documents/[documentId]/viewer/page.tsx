import { notFound } from "next/navigation";
import { PdfViewer } from "@/features/document-viewer/pdf-viewer";

export default async function ProjectDocumentViewer({ params }: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (!uuid.test(projectId) || !uuid.test(documentId)) notFound();
  const src = `/api/projects/${projectId}/documents/${documentId}`;
  return <PdfViewer title="Documento del evento" src={src} download={`${src}?download=1`} fallback={`/projects/${projectId}?eventTab=DOCUMENTS`} />;
}
