"use client";

import { useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { attachCustomerPurchaseOrderAction } from "./actions";

export type CustomerPurchaseOrderRow = {
  id: string;
  number?: string;
  originalFilename?: string;
  createdAt: string;
  href: string;
  driveArchiveStatus?: string;
};

export function CustomerPurchaseOrderCenter({ projectId, document }: { projectId:string; document?:CustomerPurchaseOrderRow }) {
  const [open,setOpen]=useState(false);
  const [pending,startTransition]=useTransition();
  const [message,setMessage]=useState("");
  return <section className="rounded-xl border p-4" data-customer-purchase-order>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-semibold">OC CLIENTE</h4><p className="mt-1 text-sm text-muted">{document?`${document.number||"Sin número"} · subida ${new Date(document.createdAt).toLocaleDateString("es-CL")}`:"Opcional · pendiente"}</p></div>
      <Button onClick={()=>setOpen(true)} variant="outline"><FileUp className="size-4"/>{document?"REEMPLAZAR OC CLIENTE":"ADJUNTAR OC CLIENTE"}</Button>
    </div>
    {document?<div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><a className="font-semibold text-brand" href={document.href} rel="noreferrer" target="_blank">VER DOCUMENTO</a><span className="text-muted">{document.originalFilename||"Archivo protegido"}</span><span className="text-muted">Drive: {document.driveArchiveStatus||"PENDIENTE"}</span></div>:null}
    {message?<p aria-live="polite" className="mt-3 text-sm font-medium">{message}</p>:null}
    {open?<MobileDialog description="La nueva OC reemplazará la vista vigente y conservará la anterior en el historial protegido." footer={null} onClose={()=>setOpen(false)} title={document?"Reemplazar OC Cliente":"Adjuntar OC Cliente"} variant="fullscreen-mobile"><form action={formData=>startTransition(async()=>{const result=await attachCustomerPurchaseOrderAction(formData);setMessage(result.ok?(result.warning||"OC Cliente guardada correctamente."):result.error);if(result.ok)setOpen(false)})} className="grid min-w-0 gap-4"><input name="projectId" type="hidden" value={projectId}/><label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">Número OC (opcional)</span><input className="min-h-11 min-w-0 rounded-xl border bg-background px-3" defaultValue={document?.number} name="purchaseOrderNumber"/></label><label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">PDF, JPG, JPEG o PNG</span><input accept="application/pdf,image/jpeg,image/png" className="min-h-11 min-w-0 rounded-xl border bg-background p-2" name="file" required type="file"/></label><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button disabled={pending} onClick={()=>setOpen(false)} type="button" variant="outline">Cancelar</Button><Button disabled={pending} type="submit">{pending?"Guardando…":"Guardar OC Cliente"}</Button></div></form></MobileDialog>:null}
  </section>;
}
