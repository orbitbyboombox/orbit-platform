"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, FileText, FolderSync, Pencil, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventPaymentManager } from "@/features/accounts-receivable/event-payment-manager";
import { StaffAssignmentCenter } from "@/features/staff-assignment-center/staff-assignment-center";
import { AgreementSigningControl } from "@/features/projects/signing/agreement-signing-control";
import { createCustomerPortalAccessAction } from "@/features/customer-portal/admin.actions";
import { getCrmDocumentUrlAction, replaceCrmDocumentAction } from "./actions";
import type { CrmCustomerEventOperations, CrmEventSummary } from "./types";

export function CustomerEventOperations({ event, operations }: { event: CrmEventSummary; operations?: CrmCustomerEventOperations }) {
  const router = useRouter();
  const [portalUrl, setPortalUrl] = useState("");
  const [message, setMessage] = useState("");
  const [editingDocument, setEditingDocument] = useState<CrmCustomerEventOperations["documents"][number] | null>(null);
  const [pending, startTransition] = useTransition();
  if (!operations) return <p className="rounded-xl border border-dashed p-5 text-sm text-muted">La información operativa de este Evento no está disponible.</p>;
  const openPortal = () => startTransition(async () => {
    const result = await createCustomerPortalAccessAction(event.projectId);
    if (!result.ok) return setMessage(result.error);
    setPortalUrl(result.url);
    window.open(result.url, "_blank", "noopener,noreferrer");
    setMessage("Portal sincronizado y disponible.");
  });
  const openDocument = (documentId: string, driveFileId: string | null) => startTransition(async () => {
    if (driveFileId) {
      window.open(`https://drive.google.com/file/d/${driveFileId}/view`, "_blank", "noopener,noreferrer");
      return;
    }
    const result = await getCrmDocumentUrlAction(documentId);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  });
  return <div className="mt-4 space-y-5 border-t pt-5">
    {operations.receivable ? <EventPaymentManager projectId={event.projectId} receivable={operations.receivable} /> : <Empty text="Este Evento no tiene una cuenta por cobrar activa." />}
    <StaffAssignmentCenter {...operations.staffAssignments} />
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <header className="flex items-start gap-3"><FileText className="mt-0.5 size-5 text-brand"/><div><h3 className="font-semibold">Documentos oficiales</h3><p className="mt-1 text-sm text-muted">Cotización, contrato y documento corporativo del Evento.</p></div></header>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {operations.documents.map((document) => <article className="rounded-xl border p-3" key={document.id}><div className="flex items-center justify-between gap-3"><span><strong className="text-sm">{documentLabel(document.type)}</strong><small className="mt-0.5 block text-muted">{new Date(document.createdAt).toLocaleDateString("es-CL")}</small></span><div className="flex gap-2"><button aria-label={`Abrir ${documentLabel(document.type)}`} className="rounded-lg border p-2 hover:border-brand" disabled={pending} onClick={() => openDocument(document.id, document.driveFileId)} type="button"><ExternalLink className="size-4"/></button><button aria-label={`Reemplazar ${documentLabel(document.type)}`} className="rounded-lg border p-2 hover:border-brand" disabled={pending} onClick={() => setEditingDocument(document)} type="button"><Pencil className="size-4"/></button></div></div></article>)}
        {!operations.documents.length && <p className="text-sm text-muted">Sin documentos registrados.</p>}
      </div>
    </section>
    <AgreementSigningControl agreementId={operations.agreement?.id} projectId={event.projectId} status={operations.agreement?.status ?? "PENDING"} />
    <section className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand"/><h3 className="font-semibold">Portal Cliente</h3></div><p className="mt-2 text-sm text-muted">{operations.portalActive ? "Portal activo. Puedes abrirlo, resincronizarlo o reenviar la comunicación oficial." : "Portal pendiente de activar."}</p><Button className="mt-4" disabled={pending} onClick={openPortal} variant="outline"><FolderSync className="size-4"/>{operations.portalActive ? "Abrir / sincronizar Portal" : "Activar Portal"}</Button>{portalUrl && <p className="mt-2 break-all text-xs text-muted">{portalUrl}</p>}</article>
      <article className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-brand"/><h3 className="font-semibold">Google Calendar</h3></div><p className="mt-2 text-sm text-muted">{operations.calendar ? `Sincronización: ${operations.calendar.status}` : "Evento de Calendar aún no disponible."}</p>{operations.calendar?.externalUrl && <Button asChild className="mt-4" variant="outline"><a href={operations.calendar.externalUrl} rel="noreferrer" target="_blank"><ExternalLink className="size-4"/>Abrir Calendar</a></Button>}<p className="mt-3 text-xs text-muted">Los cambios de fecha, hora y dirección realizados arriba sincronizan este calendario automáticamente.</p></article>
    </section>
    {message && <p aria-live="polite" className="rounded-xl border p-3 text-sm">{message}</p>}
    {editingDocument && <div aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 sm:items-center sm:p-6" role="dialog"><div className="w-full rounded-t-2xl border bg-card p-5 sm:max-w-lg sm:rounded-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Documento oficial</p><h3 className="mt-1 text-xl font-semibold">Reemplazar {documentLabel(editingDocument.type)}</h3><p className="mt-1 text-sm text-muted">El Portal y Google Drive se actualizarán sin enviar correos.</p></div><button aria-label="Cerrar" className="rounded-lg border p-2" onClick={() => setEditingDocument(null)}><X className="size-4"/></button></div><form action={(data) => { data.set("documentId", editingDocument.id); data.set("projectId", event.projectId); startTransition(async () => { const result = await replaceCrmDocumentAction(data); if (result.ok) { setEditingDocument(null); setMessage("Documento reemplazado; Portal y Drive sincronizados."); router.refresh(); } else setMessage(result.error); }); }} className="mt-5 space-y-4"><label className="block text-sm"><span className="mb-1.5 block text-muted">Archivo de reemplazo</span><input accept="application/pdf,image/jpeg,image/png,image/webp" className="min-h-11 w-full rounded-xl border bg-background px-3 py-2" name="file" required type="file"/></label><label className="block text-sm"><span className="mb-1.5 block text-muted">Motivo obligatorio</span><input className="min-h-11 w-full rounded-xl border bg-background px-3" name="reason" required/></label><Button className="w-full" disabled={pending}>{pending?"Guardando…":"Guardar y sincronizar"}</Button></form></div></div>}
  </div>;
}

function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed p-5 text-sm text-muted">{text}</p>; }
function documentLabel(type: string) { return ({ QUOTATION: "Cotización", SIGNED_AGREEMENT: "Contrato firmado", COMMERCIAL_DOCUMENT: "Documento corporativo", PAYMENT_RECEIPT: "Comprobante de pago" } as Record<string, string>)[type] ?? type.replaceAll("_", " "); }
