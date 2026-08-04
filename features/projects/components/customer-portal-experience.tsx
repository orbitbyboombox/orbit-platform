"use client";

import { ArrowLeft, CalendarDays, Check, MapPin, PartyPopper, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";

export type CustomerPortalStage = "COMMERCIAL_OPPORTUNITY" | "QUOTATION" | "BOOMBOX_EXPERIENCE" | "WAITING_SIGNATURE" | "WAITING_PAYMENT" | "CONFIRMED" | "PREPARATION" | "LIVE_EVENT" | "GALLERY" | "ARCHIVED";

export interface CustomerPortalExperienceProps {
  projectName: string;
  clientName: string;
  eventDate: string;
  location: string;
  services: readonly string[];
  portalId: string;
  portalUrl: string;
  stage: CustomerPortalStage;
  onClose: () => void;
}

interface PortalStageContent {
  label: string;
  badge: StatusBadgeProps["variant"];
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  message: string;
}

const portalContent: Readonly<Record<CustomerPortalStage, PortalStageContent>> = {
  COMMERCIAL_OPPORTUNITY: { label: "Primer contacto", badge: "neutral", eyebrow: "Estamos preparando tu experiencia", title: "Bienvenido a BOOMBOX", description: "Aquí encontrarás toda la información importante de tu proyecto.", action: "Ver información", message: "Pronto tendrás novedades de nuestro equipo." },
  QUOTATION: { label: "Cotización", badge: "warning", eyebrow: "Tu propuesta está disponible", title: "Revisa tu experiencia BOOMBOX", description: "Preparamos una propuesta pensada especialmente para tu evento.", action: "Revisar propuesta", message: "Tu propuesta está lista para revisar." },
  BOOMBOX_EXPERIENCE: { label: "Confirmación", badge: "info", eyebrow: "Comencemos", title: "Confirma tu experiencia", description: "En pocos minutos dejaremos todo preparado para tu gran día.", action: "Comenzar", message: "Confirma tus datos para continuar." },
  WAITING_SIGNATURE: { label: "Firma pendiente", badge: "warning", eyebrow: "Ya casi terminamos", title: "Tu confirmación está esperando", description: "Solo necesitamos tu firma para continuar con la reserva.", action: "Agregar firma", message: "Tu firma es el siguiente paso." },
  WAITING_PAYMENT: { label: "Pago pendiente", badge: "warning", eyebrow: "Último paso de reserva", title: "Selecciona tu forma de pago", description: "Elige la alternativa que prefieras para confirmar tu proyecto.", action: "Ver alternativas", message: "Tu proyecto quedará confirmado después de este paso." },
  CONFIRMED: { label: "Confirmado", badge: "success", eyebrow: "Todo listo", title: "Tu experiencia está confirmada", description: "El equipo BOOMBOX comenzará la coordinación de tu evento.", action: "Ver proyecto", message: "Te avisaremos cuando comience la preparación." },
  PREPARATION: { label: "En preparación", badge: "info", eyebrow: "Estamos trabajando en tu evento", title: "Tu experiencia está en preparación", description: "Nuestro equipo está coordinando cada detalle para que todo salga perfecto.", action: "Ver preparación", message: "No necesitas hacer nada por ahora. Nosotros nos encargamos." },
  LIVE_EVENT: { label: "Evento en vivo", badge: "success", eyebrow: "Hoy es el gran día", title: "Tu experiencia BOOMBOX está en marcha", description: "Nuestro equipo está operando y monitoreando el evento.", action: "Ver estado", message: "Todo está funcionando según lo planificado." },
  GALLERY: { label: "Galería disponible", badge: "success", eyebrow: "Tus recuerdos están listos", title: "Revive tu experiencia", description: "Tu galería BOOMBOX ya está disponible para ver y compartir.", action: "Abrir galería", message: "Tu galería y respaldo están listos." },
  ARCHIVED: { label: "Experiencia entregada", badge: "neutral", eyebrow: "Gracias por confiar en nosotros", title: "Tu proyecto está completo", description: "Aquí podrás seguir accediendo a la información y recuerdos de tu experiencia.", action: "Ver recuerdos", message: "Este enlace seguirá siendo tu acceso permanente." },
};

export function CustomerPortalExperience({ projectName, clientName, eventDate, location, services, portalId, portalUrl, stage, onClose }: CustomerPortalExperienceProps) {
  const content = portalContent[stage];
  return <div className="mx-auto max-w-6xl space-y-6 pb-10 sm:space-y-8">
    <header className="rounded-2xl border bg-card p-5 sm:p-8 lg:p-10">
      <button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver al proyecto</button>
      <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Portal del Cliente</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">{projectName}</h1><p className="mt-3 text-base text-muted">Hola, {clientName}</p></div><StatusBadge label={content.label} variant={content.badge} /></div>
      <div className="mt-8 flex flex-col gap-2 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between"><div><span className="text-muted">Portal ID</span><p className="mt-1 font-mono font-semibold tracking-wide">{portalId}</p></div><p className="break-all text-muted">{portalUrl}</p></div>
    </header>

    <SmartCard className="overflow-hidden border-brand/20 p-6 sm:p-10 lg:p-14">
      <div className="mx-auto max-w-3xl text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand/10 text-brand sm:size-20"><PartyPopper aria-hidden="true" className="size-8 sm:size-10" /></span><p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{content.eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{content.title}</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">{content.description}</p><ActionButton className="mt-8 w-full sm:w-auto" label={content.action} /></div>
    </SmartCard>

    <section aria-label="Información de tu evento" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <PortalDetail icon={CalendarDays} label="Fecha" value={eventDate} />
      <PortalDetail icon={MapPin} label="Lugar" value={location} />
      <PortalDetail icon={Sparkles} label="Experiencia" value={services.join(" + ") || "Por confirmar"} />
      <PortalDetail icon={ShieldCheck} label="Estado" value={content.label} />
    </section>

    <SmartCard icon={<Check aria-hidden="true" className="size-5 text-success" />} primaryValue={content.message} secondaryValue="Mostramos únicamente la información correspondiente a esta etapa." title="Actualización de tu proyecto" />
  </div>;
}

function PortalDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <SmartCard icon={<Icon aria-hidden="true" className="size-5" />} primaryValue={value} secondaryValue={label} />;
}
