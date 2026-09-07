"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";
import { WhatsAppInbox } from "@/features/communication-hub/components/whatsapp-inbox";
import type { CommunicationHubProjection } from "@/features/communication-hub";
import type { BiancaOperationalStatus } from "./bianca-status";

export function BiancaWorkspace({ projection, status, whatsappConnected, deliveryLabels }: { projection: CommunicationHubProjection; status: BiancaOperationalStatus; whatsappConnected: boolean; deliveryLabels: { engine: string; messaging: string; ai: string } }) {
  const attention = projection.conversations.filter((item) => item.status === "HUMAN_HANDOFF").length;
  return <main className="mx-auto w-full max-w-[1480px] space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
    <header className="rounded-2xl border bg-card p-5 sm:p-7">
      <Link href="/operations" className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-foreground"><ArrowLeft className="size-4" />Escritorio</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">BIANCA</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">WhatsApp · Ventas &amp; Atención</h1><p className="mt-2 text-sm text-muted">Workspace operativo sobre el Communication Hub canónico.</p></div>
        <div className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold"><span className={`size-2 rounded-full ${status === "ACTIVA" ? "bg-success" : status === "REQUIERE ATENCIÓN" ? "bg-warning" : "bg-muted"}`} />{status}</div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[{ label: "WhatsApp", value: whatsappConnected ? "Conectado" : "Esperando aprobación de Meta" }, { label: "Motor BIANCA", value: deliveryLabels.engine }, { label: "Mensajería clientes", value: deliveryLabels.messaging }, { label: "IA", value: deliveryLabels.ai }].map((item) => <div className="rounded-xl border bg-background/50 p-3" key={item.label}><p className="text-[11px] uppercase tracking-wide text-muted">{item.label}</p><p className="mt-1 text-sm font-semibold">{item.value}</p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" />Delivery automático: OFF</span><span>Requieren tu ayuda: <b className="text-foreground">{attention}</b></span><Link className="font-semibold text-brand hover:underline" href="/settings/bianca-lab">Abrir BIANCA Lab <ExternalLink className="ml-1 inline size-3" /></Link></div>
    </header>
    {!projection.conversations.length && <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center"><MessageCircle className="mx-auto size-8 text-muted" /><p className="mt-3 font-semibold">BIANCA está preparada.</p><p className="mt-2 text-sm text-muted">Las conversaciones aparecerán aquí cuando WhatsApp esté conectado y la mensajería sea activada por Founder.</p><Link className="mt-5 inline-flex min-h-10 items-center rounded-lg border px-4 text-sm font-semibold" href="/settings/bianca-lab">ABRIR BIANCA LAB</Link></div>}
    <WhatsAppInbox conversations={projection.conversations} events={projection.events} workspaceMode />
  </main>;
}
