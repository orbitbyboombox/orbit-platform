"use client";

import { Bot, CheckCircle2, Clock3, Inbox, Mail, MessageCircle, MessagesSquare, Phone, UserRoundCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { BrandLogo } from "@/components/brand-logo";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CommunicationChannel, CommunicationHubIndicators, UnifiedCommunicationEvent, UnifiedConversation } from "../types/communication-hub.types";

const CHANNEL: Record<CommunicationChannel, { label: string; icon: typeof Mail }> = {
  GOOGLE_GMAIL: { label: "Gmail", icon: Mail }, WHATSAPP_BUSINESS: { label: "WhatsApp", icon: MessageCircle }, INSTAGRAM_DIRECT: { label: "Instagram", icon: MessagesSquare }, WEB_CHAT: { label: "Web Chat", icon: Bot }, PHONE_LOG: { label: "Registro telefónico", icon: Phone }, FUTURE: { label: "Canal futuro", icon: Inbox },
};

export interface CommunicationHubProps { conversations: readonly UnifiedConversation[]; events: readonly UnifiedCommunicationEvent[]; indicators: CommunicationHubIndicators; }

export function CommunicationHub({ conversations, events, indicators }: CommunicationHubProps) {
  const [humanConversation, setHumanConversation] = useState<string | null>("conversation-camilo");
  const active = conversations.find(({ id }) => id === humanConversation);
  return (
    <section aria-labelledby="communication-hub" className="space-y-6 border-t pt-10 lg:pt-12">
      <div id="communication-hub"><BrandLogo className="mb-3 h-14 w-40" surface="dark" /><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">ORBIT · COMUNICACIONES</p><SectionTitle description="Una sola historia por cliente, independiente del canal utilizado." title="Centro de Comunicaciones" /></div>

      <section aria-label="Indicadores de conversaciones" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmartCard icon={<Inbox aria-hidden="true" className="size-5" />} primaryValue={indicators.pendingConversations.toString()} secondaryValue="Requieren siguiente acción" title="Conversaciones pendientes" />
        <SmartCard icon={<UserRoundCheck aria-hidden="true" className="size-5" />} primaryValue={indicators.humanConversations.toString()} secondaryValue="Atendidas por BOOMBOX" status={<StatusBadge label="Handoff" variant="warning" />} title="Conversaciones humanas" />
        <SmartCard icon={<Clock3 aria-hidden="true" className="size-5" />} primaryValue={indicators.waitingCustomer.toString()} secondaryValue="NOVA espera una respuesta" title="Esperando cliente" />
        <SmartCard icon={<CheckCircle2 aria-hidden="true" className="size-5" />} primaryValue={indicators.completedConversations.toString()} secondaryValue="Flujo finalizado" status={<StatusBadge label="Completada" variant="success" />} title="Conversaciones completadas" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <SmartCard icon={<MessagesSquare aria-hidden="true" className="size-5" />} primaryValue="Historia unificada" secondaryValue="Más reciente primero · Todos los canales" status={<StatusBadge label={`${events.length} eventos`} variant="info" />} title="Historial del cliente">
          <ol className="space-y-3">
            {events.map((event) => { const channel = CHANNEL[event.channel]; const Icon = channel.icon; return <li className="flex gap-3 rounded-xl border bg-background/35 p-4" key={event.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent"><Icon aria-hidden="true" className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{event.summary}</p><StatusBadge label={channel.label} variant="neutral" /></div><p className="mt-1 text-xs text-muted">{event.direction === "INBOUND" ? "Cliente" : event.direction === "OUTBOUND" ? "NOVA" : "Sistema"} · {new Date(event.occurredAt).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })}</p></div></li>; })}
            {!events.length && <li className="rounded-xl border border-dashed p-6 text-center"><p className="text-sm font-medium">Aún no existen comunicaciones.</p><p className="mt-1 text-sm text-muted">La historia unificada aparecerá aquí automáticamente.</p></li>}
          </ol>
        </SmartCard>

        <SmartCard icon={<UsersRound aria-hidden="true" className="size-5" />} primaryValue={active?.customerName ?? "Ninguna conversación"} secondaryValue={active ? `Atendida por ${active.assignedHuman}` : "NOVA mantiene el control"} status={<StatusBadge label={active ? "Control humano" : "NOVA activo"} variant={active ? "warning" : "success"} />} title="Traspaso humano">
          <div className="space-y-3 text-sm"><p className="rounded-xl bg-accent/45 p-4 leading-6">El historial, la memoria y el siguiente paso permanecen intactos durante el traspaso.</p><div className="grid gap-2"><ActionButton icon={UserRoundCheck} label="Tomar conversación" onClick={() => setHumanConversation("conversation-camilo")} type="button" /><ActionButton icon={Bot} label="Liberar y reanudar NOVA" onClick={() => setHumanConversation(null)} type="button" variant="outline" /></div></div>
        </SmartCard>
      </div>

    </section>
  );
}
