"use client";

import { useState, useTransition } from "react";
import { Copy, FileSignature } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createSigningInvitationAction } from "./signing.actions";

export function AgreementSigningControl({ agreementId, projectId, status }: { agreementId?: string; projectId: string; status: string }) {
  const [pending,startTransition] = useTransition(); const [url,setUrl] = useState(""); const [message,setMessage] = useState(""); const signed = status === "SIGNED";
  const create = () => agreementId && startTransition(async () => { const result = await createSigningInvitationAction(agreementId,projectId); if (!result.ok) { setMessage(result.error); return; } setUrl(result.url); setMessage("Borrador Gmail preparado. Revisa antes de enviarlo."); });
  return <section className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileSignature className="size-5 text-brand" /><div><h2 className="font-semibold">Firma digital</h2><p className="mt-1 text-sm text-muted">Enlace único, privado y válido por siete días.</p></div></div><StatusBadge label={signed ? "Firmado y bloqueado" : agreementId ? "Listo para enviar" : "Acuerdo pendiente"} variant={signed ? "success" : agreementId ? "info" : "warning"} /></div>{!signed && agreementId && <ActionButton className="mt-5" disabled={pending} label={pending ? "Preparando…" : "Preparar enlace y borrador Gmail"} onClick={create} />}{url && <div className="mt-5 rounded-xl border bg-background/40 p-4"><p className="break-all text-sm">{url}</p><ActionButton className="mt-3" icon={Copy} label="Copiar enlace" onClick={() => void navigator.clipboard.writeText(url)} variant="outline" /></div>}{message && <p className="mt-4 text-sm font-medium">{message}</p>}</section>;
}
