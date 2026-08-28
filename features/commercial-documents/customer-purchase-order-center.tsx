"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { attachCustomerPurchaseOrderAction, retryCustomerPurchaseOrderDriveAction } from "./actions";

export type CustomerPurchaseOrderRow = {
  id: string;
  number?: string;
  originalFilename?: string;
  fileSize?: number;
  createdAt: string;
  href: string;
  driveArchiveStatus?: string;
};

export function CustomerPurchaseOrderCenter({ projectId, document, onPreview }: {
  projectId: string;
  document?: CustomerPurchaseOrderRow;
  onPreview?: (document: CustomerPurchaseOrderRow) => void;
}) {
  const router = useRouter();
  const uploadLock = useRef(false);
  const driveLock = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const driveReady = document?.driveArchiveStatus === "SYNCED" || document?.driveArchiveStatus === "ARCHIVED";
  const openComposer = () => {
    setMessage("");
    setOpen(true);
  };
  const upload = (formData: FormData) => {
    if (uploadLock.current) return;
    uploadLock.current = true;
    startTransition(async () => {
      try {
        const result = await attachCustomerPurchaseOrderAction(formData);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setMessage(result.warning || "✓ OC CLIENTE ADJUNTADA");
        setOpen(false);
        // A full navigation prevents a tab opened before a deploy from reconciling
        // its stale client tree with the newly rendered Event after the Server Action.
        window.location.reload();
      } finally {
        uploadLock.current = false;
      }
    });
  };
  const retryDrive = () => {
    if (!document || driveLock.current) return;
    driveLock.current = true;
    startTransition(async () => {
      try {
        const result = await retryCustomerPurchaseOrderDriveAction(projectId, document.id);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) router.refresh();
      } finally {
        driveLock.current = false;
      }
    });
  };
  return <section className="min-w-0 rounded-xl border p-4" data-customer-purchase-order>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="font-semibold">OC CLIENTE</h4>
        {document ? <>
          <p className="mt-1 font-semibold text-success">✓ RECIBIDA</p>
          <p className="mt-1 break-words text-sm text-muted">{document.originalFilename || "Archivo protegido"}</p>
          <p className="mt-1 text-sm text-muted">
            {document.number ? `OC ${document.number} · ` : ""}subida {new Date(document.createdAt).toLocaleDateString("es-CL")}
          </p>
        </> : <p className="mt-1 text-sm text-muted">Opcional · pendiente</p>}
      </div>
      <Button disabled={pending} onClick={openComposer} variant="outline">
        <FileUp className="size-4"/>{document ? "REEMPLAZAR / ACTUALIZAR" : "ADJUNTAR OC CLIENTE"}
      </Button>
    </div>
    {document ? <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 text-sm">
      <button className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand" onClick={()=>onPreview?.(document)} type="button">
        VER DOCUMENTO<ExternalLink className="size-4"/>
      </button>
      <a className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand" href={`${document.href}?download=1`}>
        DESCARGAR<Download className="size-4"/>
      </a>
      {driveReady
        ? <span className="text-success">✓ Archivada en Drive</span>
        : <span className="text-amber-600">⚠ Archivo pendiente de sincronizar con Drive</span>}
      {!driveReady ? <Button disabled={pending} onClick={retryDrive} size="sm" variant="outline">
        <RefreshCw className="size-4"/>{pending ? "SINCRONIZANDO..." : "REINTENTAR DRIVE"}
      </Button> : null}
    </div> : null}
    {message ? <p aria-live="polite" className="mt-3 break-words text-sm font-medium">{message}</p> : null}
    {open ? <MobileDialog
      description="La nueva OC reemplazará la vista vigente y conservará la anterior en el historial protegido."
      footer={null}
      onClose={() => { if (!pending) setOpen(false); }}
      title={document ? "Reemplazar OC Cliente" : "Adjuntar OC Cliente"}
      variant="fullscreen-mobile"
    >
      <form action={upload} className="grid min-w-0 gap-4">
        <input name="projectId" type="hidden" value={projectId}/>
        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium">Número OC (opcional)</span>
          <input className="min-h-11 min-w-0 rounded-xl border bg-background px-3" defaultValue={document?.number} name="purchaseOrderNumber"/>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium">PDF, JPG, JPEG o PNG · máximo 20 MB</span>
          <input accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="min-h-11 min-w-0 max-w-full rounded-xl border bg-background p-2" name="file" required type="file"/>
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">Cancelar</Button>
          <Button disabled={pending} type="submit">{pending ? "SUBIENDO OC..." : "GUARDAR OC CLIENTE"}</Button>
        </div>
      </form>
    </MobileDialog> : null}
  </section>;
}
