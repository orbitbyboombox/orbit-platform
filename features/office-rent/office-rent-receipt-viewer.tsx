"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitLoader } from "@/components/ui/orbit-loader";

export function OfficeRentReceiptViewer({ documentId, receiptNumber }: { documentId: string; receiptNumber: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const source = `/api/office-rent/documents/${documentId}?disposition=inline`;
  const download = `/api/office-rent/documents/${documentId}?disposition=attachment`;
  const label = `RECIBO N°${String(receiptNumber).padStart(3, "0")}`;

  const printReceipt = () => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) {
      window.open(source, "_blank", "noopener,noreferrer");
      return;
    }
    frameWindow.focus();
    frameWindow.print();
  };

  return <main className="-mx-3 -mt-3 min-h-[calc(100dvh-5rem)] sm:-mx-6 sm:-mt-6 lg:-mx-8">
    <header className="sticky top-0 z-20 border-b bg-background/95 px-3 py-3 shadow-sm backdrop-blur print:hidden sm:px-6 sm:py-4">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link href="/office-rent"><ArrowLeft className="size-4"/>Volver a Arriendo Oficina</Link>
          </Button>
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Documento oficial ORBIT</p>
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{label}</h1>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button asChild variant="outline"><a download href={download}><Download className="size-4"/>Descargar</a></Button>
          <Button disabled={!loaded} onClick={printReceipt} type="button"><Printer className="size-4"/>Imprimir</Button>
        </div>
      </div>
    </header>
    <section aria-busy={!loaded} aria-label={`Vista previa ${label}`} className="relative min-h-[calc(100dvh-14.5rem)] bg-black/35 p-2 print:min-h-0 print:bg-white print:p-0 sm:min-h-[calc(100dvh-11rem)] sm:p-4">
      {!loaded ? <div className="absolute inset-0 z-10 grid place-items-center bg-background/75 print:hidden"><OrbitLoader label="Cargando recibo…" variant="section"/></div> : null}
      <iframe
        className="mx-auto block h-[calc(100dvh-15.5rem)] min-h-[560px] w-full max-w-[1120px] rounded-xl border bg-white shadow-2xl print:h-screen print:min-h-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none sm:h-[calc(100dvh-12rem)]"
        onLoad={() => setLoaded(true)}
        ref={frameRef}
        src={`${source}#toolbar=1&navpanes=0&view=FitH`}
        title={label}
      />
    </section>
  </main>;
}
