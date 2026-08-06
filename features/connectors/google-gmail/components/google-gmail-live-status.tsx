"use client";

import { AlertCircle, Clock3, FileText, MailCheck, MailPlus, MessagesSquare, Paperclip, Send, Sparkles, UsersRound } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { BrandLogo } from "@/components/brand-logo";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { GMAIL_TEMPLATE_TYPES } from "../templates/google-gmail-template.engine";
import { MOCK_GMAIL_COMMUNICATIONS, MOCK_GMAIL_METRICS, MOCK_GMAIL_RECOMMENDATION, MOCK_GMAIL_TEMPLATE } from "../application/mock-google-gmail-live";

const TEMPLATE_LABELS = { QUOTATION: "Cotización", CONTRACT: "Contrato", RESERVATION_CONFIRMATION: "Confirmación de reserva", PAYMENT_CONFIRMATION: "Confirmación de pago", REMINDER: "Recordatorio", FINAL_CONFIRMATION: "Confirmación final", INTERNAL_NOTIFICATION: "Notificación interna" } as const;

export function GoogleGmailLiveStatus() {
  const [queued, setQueued] = useState(false);
  return (
    <section aria-labelledby="google-gmail-live" className="space-y-6 border-t pt-10 lg:pt-12">
      <div id="google-gmail-live">
        <BrandLogo className="mb-3 h-14 w-40" surface="dark" />
        <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">GOOGLE WORKSPACE · GMAIL</p><DataStateBadge state="DEMO" /></div>
        <SectionTitle description="Plantillas y cola visual preparadas; no se envían correos externos desde esta pantalla." title="Gmail" />
      </div>

      <section aria-label="Indicadores de Gmail" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SmartCard icon={<Clock3 aria-hidden="true" className="size-5" />} primaryValue={MOCK_GMAIL_METRICS.pending.toString()} secondaryValue="Comunicaciones preparadas" title="Correos pendientes" />
        <SmartCard icon={<AlertCircle aria-hidden="true" className="size-5" />} primaryValue={MOCK_GMAIL_METRICS.failed.toString()} secondaryValue="Reintento disponible" status={<StatusBadge label="Atención" variant="warning" />} title="Correos fallidos" />
        <SmartCard icon={<MailCheck aria-hidden="true" className="size-5" />} primaryValue={MOCK_GMAIL_METRICS.lastCommunication} secondaryValue="Ejemplo de contrato enviado" status={<DataStateBadge state="MOCK" />} title="Última comunicación simulada" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <SmartCard icon={<MailPlus aria-hidden="true" className="size-5" />} primaryValue={MOCK_GMAIL_TEMPLATE.subject} secondaryValue="María González · Matrimonio · BBOX360" status={<StatusBadge label={queued ? "En cola" : "Pendiente"} variant={queued ? "info" : "neutral"} />} title="Comunicación preparada">
          <div className="rounded-xl border bg-background/35 p-4 text-sm leading-6 text-muted">
            {MOCK_GMAIL_TEMPLATE.textBody.split("\n\n").map((paragraph) => <p className="not-first:mt-3" key={paragraph}>{paragraph}</p>)}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border px-4 py-3"><Paperclip aria-hidden="true" className="size-4 text-brand" /><div className="min-w-0"><p className="truncate text-sm font-semibold">Contrato BOOMBOX.pdf</p><p className="text-xs text-muted">Referencia única desde Google Drive</p></div></div>
          <div className="mt-5 border-t pt-5"><ActionButton icon={Send} label={queued ? "Correo en cola" : "Enviar comunicación"} onClick={() => setQueued(true)} type="button" /></div>
        </SmartCard>

        <SmartCard icon={<Sparkles aria-hidden="true" className="size-5 text-brand" />} primaryValue={MOCK_GMAIL_RECOMMENDATION.title} secondaryValue={MOCK_GMAIL_RECOMMENDATION.reason} status={<StatusBadge label="Una recomendación" variant="warning" />} title="ORBIT NOVA">
          <div className="space-y-3 border-t pt-5 text-sm"><div className="flex items-center gap-3"><MessagesSquare aria-hidden="true" className="size-4 text-brand" /><span>Un hilo permanente por cliente</span></div><div className="flex items-center gap-3"><UsersRound aria-hidden="true" className="size-4 text-brand" /><span>Notificaciones operacionales para Staff</span></div><div className="flex items-center gap-3"><FileText aria-hidden="true" className="size-4 text-brand" /><span>Adjuntos referenciados desde Drive</span></div></div>
        </SmartCard>
      </div>

      <SmartCard icon={<MessagesSquare aria-hidden="true" className="size-5" />} primaryValue="gmail-thread-customer-maria" secondaryValue="Todas las comunicaciones permanecen agrupadas en la misma conversación." status={<DataStateBadge state="MOCK" />} title="Historial de comunicación">
        <div className="grid gap-3 lg:grid-cols-2">
          {MOCK_GMAIL_COMMUNICATIONS.map((communication) => <div className="rounded-xl border bg-background/35 p-4" key={communication.id}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{communication.subject}</p><p className="mt-1 text-xs text-muted">{communication.sentAt}</p></div><StatusBadge label={communication.status === "DELIVERED" ? "Entregado" : communication.status} variant="success" /></div>{communication.attachments.length > 0 && <p className="mt-3 text-xs font-medium text-brand">{communication.attachments[0].name} · Google Drive</p>}</div>)}
        </div>
        <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {GMAIL_TEMPLATE_TYPES.map((type) => <div className="rounded-xl bg-accent/55 px-3 py-3 text-xs font-semibold" key={type}>{TEMPLATE_LABELS[type]}</div>)}
        </div>
      </SmartCard>
    </section>
  );
}
