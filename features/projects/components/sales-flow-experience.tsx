"use client";

import { useState } from "react";
import { ArrowLeft, BadgeCheck, BookOpen, BriefcaseBusiness, Check, Circle, FileText, MapPinned, Palette, QrCode, Send, Sparkles, UserRoundCheck } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { TimelineItem } from "@/components/timeline/timeline-item";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { EventTypeId } from "@/features/business-core";
import { formatServiceSummary } from "@/lib/format-service-summary";
import { resolveSalesFlow } from "../engine";
import type { Project } from "../types/project";
import { CustomerOnboardingExperience } from "./customer-onboarding-experience";

export interface SalesFlowExperienceProps {
  project: Project;
  eventType: EventTypeId;
  onClose: () => void;
}

const currency = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function SalesFlowExperience({ project, eventType, onClose }: SalesFlowExperienceProps) {
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const result = resolveSalesFlow(eventType);
  if (!result.success) return <SmartCard actionLabel="Volver a proyectos" onAction={onClose} primaryValue="Clasificación pendiente" secondaryValue={result.error.message} status={<StatusBadge label="Revisión requerida" variant="warning" />} title="Flujo comercial" />;

  const { flow } = result;
  const social = flow.type === "SOCIAL";
  const qrPrice = flow.qr.price.status === "DEFINED" ? currency.format(flow.qr.price.value.amount) : "Por cotizar";
  const brandingPrice = currency.format(flow.branding.pricePerSide.amount);

  if (onboardingOpen) {
    return <CustomerOnboardingExperience onClose={() => setOnboardingOpen(false)} project={project} qrIncluded={flow.qr.included} vatLabel={flow.vat.mentionVatSeparately ? "+ IVA" : "IVA incluido"} />;
  }

  return <WorkspaceLayout
    className="max-w-none p-0"
    header={<header className="rounded-2xl border bg-card p-5 sm:p-7"><button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver a proyectos</button><div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{flow.name}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{project.name}</h1><p className="mt-3 text-sm leading-6 text-muted sm:text-base">{project.client.name} · {project.event.city} · {project.event.date}</p></div><div className="flex flex-wrap gap-2"><StatusBadge label={social ? "Flujo social" : "Flujo corporativo"} variant={social ? "info" : "warning"} /><StatusBadge label="Cotización" variant="neutral" /></div></div></header>}
    copilot={<OrbitCopilot actionLabel={flow.actionLabel} estimatedTime={social ? "20 segundos" : "2 minutos"} impact={social ? "El cliente recibe el material oficial necesario para decidir." : "La empresa recibe una propuesta formal con todas las condiciones tributarias."} reason={social ? "Este proyecto corresponde a un evento social." : "El tipo de evento Empresa exige una cotización corporativa."} recommendation={flow.recommendation} title="Siguiente decisión comercial" />}
    mainContent={social ? <SocialFlow project={project} qrIncluded={flow.qr.included} transportRatesAvailable={flow.transportRates.length > 0} vatLabel={flow.vat.mentionVatSeparately ? "+ IVA" : "IVA incluido"} /> : <CorporateFlow brandingPrice={brandingPrice} minimumSides={flow.branding.minimumSides} project={project} qrPrice={qrPrice} />}
    timeline={<SmartCard title="Progreso comercial" description="El mismo proyecto avanza sin duplicar datos."><div className="mt-1">{flow.timeline.map((item, index) => <TimelineItem description={index === 0 ? "Etapa completada" : index === 1 ? "Etapa actual" : "Pendiente"} icon={index === 0 ? <Check aria-hidden="true" className="size-4 text-success" /> : index === 1 ? <Circle aria-hidden="true" className="size-3 fill-brand text-brand" /> : undefined} isLast={index === flow.timeline.length - 1} key={item.id} title={item.label} />)}</div></SmartCard>}
    bottomAction={<div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:grid-cols-2 sm:p-4"><ActionButton icon={social ? Send : FileText} label={flow.actionLabel} /><ActionButton icon={UserRoundCheck} label="Iniciar onboarding" onClick={() => setOnboardingOpen(true)} variant="outline" /></div>}
  />;
}

function SocialFlow({ project, qrIncluded, transportRatesAvailable, vatLabel }: { project: Project; qrIncluded: boolean; transportRatesAvailable: boolean; vatLabel: string }) {
  return <div className="grid gap-4 sm:grid-cols-2"><SmartCard actionLabel="Adjuntar catálogo" className="sm:col-span-2" icon={<BookOpen aria-hidden="true" className="size-5" />} primaryValue="Catálogo oficial BOOMBOX Wedding" secondaryValue="Experiencias, servicios y referencias oficiales" status={<StatusBadge label="Listo para adjuntar" variant="success" />} title="Catálogo oficial" /><SmartCard actionLabel="Revisar traslado" icon={<MapPinned aria-hidden="true" className="size-5" />} primaryValue={transportRatesAvailable ? "Tarifa disponible" : "Por confirmar"} secondaryValue={`${project.event.city} · tabla oficial de traslado`} status={<StatusBadge label={transportRatesAvailable ? "Definido" : "Requiere cotización"} variant={transportRatesAvailable ? "success" : "warning"} />} title="Información de traslado" /><SmartCard icon={<FileText aria-hidden="true" className="size-5" />} primaryValue="Resumen comercial" secondaryValue={project.services.length ? formatServiceSummary(project.services) : "Servicios por configurar"} status={<StatusBadge label="Sin documento formal" variant="info" />} title="Cotización" /><SmartCard icon={<QrCode aria-hidden="true" className="size-5" />} primaryValue={qrIncluded ? "QR incluido" : "QR por revisar"} secondaryValue={vatLabel} title="Condiciones comerciales" /><SmartCard icon={<Sparkles aria-hidden="true" className="size-5" />} primaryValue="Seguimiento pendiente" secondaryValue="Esperando aceptación del cliente" status={<StatusBadge label="Siguiente etapa" variant="warning" />} title="Seguimiento comercial" /></div>;
}

function CorporateFlow({ project, qrPrice, brandingPrice, minimumSides }: { project: Project; qrPrice: string; brandingPrice: string; minimumSides: number }) {
  return <div className="grid gap-4 sm:grid-cols-2"><SmartCard actionLabel="Preparar cotización" className="sm:col-span-2" icon={<BriefcaseBusiness aria-hidden="true" className="size-5" />} primaryValue="Cotización corporativa formal" secondaryValue={`${project.client.company ?? project.client.name} · todos los valores + IVA`} status={<StatusBadge label="Requerida" variant="warning" />} title="Propuesta corporativa" /><SmartCard icon={<FileText aria-hidden="true" className="size-5" />} primaryValue="Resumen comercial" secondaryValue={project.services.length ? formatServiceSummary(project.services) : "Servicios por configurar"} status={<StatusBadge label="+ IVA" variant="info" />} title="Condiciones" /><SmartCard icon={<BadgeCheck aria-hidden="true" className="size-5" />} primaryValue="Propuesta profesional" secondaryValue="Alcance, servicios y aprobación comercial" title="Documento comercial" /><SmartCard icon={<QrCode aria-hidden="true" className="size-5" />} primaryValue={`${qrPrice} + IVA`} secondaryValue="QR corporativo" title="QR" /><SmartCard icon={<Palette aria-hidden="true" className="size-5" />} primaryValue={`${brandingPrice} + IVA`} secondaryValue={`Por cara · mínimo ${minimumSides} caras`} title="Branding" /></div>;
}
