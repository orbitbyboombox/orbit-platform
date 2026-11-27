"use client";

import { useState } from "react";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { PdfViewer } from "@/features/document-viewer/pdf-viewer";

export function ReceivedFeePdf({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const endpoint = `/api/finance/tributary/fees/${encodeURIComponent(id)}`;
  return <>
    <button type="button" className="mt-2 min-h-10 text-sm font-semibold text-brand" onClick={() => setOpen(true)}>Ver PDF</button>
    {open && <MobileDialog title="Boleta de honorarios" onClose={close} size="xl" variant="fullscreen-mobile">
      <PdfViewer title="Boleta de honorarios" src={`${endpoint}?view=1`} download={endpoint}
        fallback="/finance/tributary/accounting" onClose={close} />
    </MobileDialog>}
  </>;
}
