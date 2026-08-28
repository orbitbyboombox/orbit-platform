"use client";

import { OrbitDocumentViewer } from "@/components/documents/orbit-document-viewer";

export function PdfViewer({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  return <OrbitDocumentViewer onClose={onClose} src={src} title={title}/>;
}
