"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Gift, Layers3, Percent, ReceiptText, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { cn } from "@/lib/utils";
import { formatServiceSummary } from "@/lib/format-service-summary";

const steps = ["Tipo de evento", "Servicios", "Duración", "Extras", "Resumen", "Enviar cotización"] as const;
const eventTypes = ["Matrimonio", "Empresa", "Cumpleaños", "Fiesta", "Otro"] as const;
const servicePrices = { Classic: 420000, Polaroid: 360000, "Black Studio": 520000, "360": 480000, LightBox: 390000, BoomBall: 450000 } as const;
const durationOptions = [{ label: "2 horas", value: 2, factor: 1 }, { label: "3 horas", value: 3, factor: 1.35 }, { label: "4 horas", value: 4, factor: 1.65 }] as const;
const extraPrices = { QR: 45000, Libro: 85000, Imanes: 65000, Branding: 120000, Traslado: 70000, "Horas extra": 140000 } as const;

type EventType = (typeof eventTypes)[number];
type Service = keyof typeof servicePrices;
type Extra = keyof typeof extraPrices;

export interface QuotationExperienceProps {
  onClose: () => void;
}

const currency = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function QuotationExperience({ onClose }: QuotationExperienceProps) {
  const [step, setStep] = useState(0);
  const [eventType, setEventType] = useState<EventType>();
  const [services, setServices] = useState<Service[]>([]);
  const [duration, setDuration] = useState(2);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [sent, setSent] = useState(false);

  const totals = useMemo(() => {
    const factor = durationOptions.find((option) => option.value === duration)?.factor ?? 1;
    const subtotal = Math.round(services.reduce((sum, service) => sum + servicePrices[service], 0) * factor);
    const extrasTotal = extras.reduce((sum, extra) => sum + extraPrices[extra], 0);
    const total = subtotal + extrasTotal;
    return { subtotal, extrasTotal, total, margin: Math.round(total * 0.42) };
  }, [duration, extras, services]);

  const toggleService = (service: Service) => setServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  const toggleExtra = (extra: Extra) => setExtras((current) => current.includes(extra) ? current.filter((item) => item !== extra) : [...current, extra]);
  const canContinue = step === 0 ? Boolean(eventType) : step === 1 ? services.length > 0 : true;
  const recommendation = step < 1 ? "Elegir tipo de evento" : step === 1 && !services.includes("Classic") ? "Agregar Classic" : step < 3 ? "Confirmar duración" : step === 3 && !extras.includes("QR") ? "Agregar QR" : step < 5 ? "Revisar cotización" : "Enviar cotización";
  const nextStep = () => setStep((current) => Math.min(current + 1, steps.length - 1));

  return <WorkspaceLayout
    className="max-w-none p-0"
    header={<header className="rounded-2xl border bg-card p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><button className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver a proyectos</button><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Cotización comercial</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Configura la experiencia</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Josefina + Nicolás · Matrimonio · Viña del Mar</p></div><StatusBadge label={sent ? "Cotización enviada" : `Paso ${step + 1} de ${steps.length}`} variant={sent ? "success" : "info"} /></div><div className="mt-7 flex gap-1.5" aria-label="Progreso de la cotización">{steps.map((label, index) => <span aria-label={`${label}: ${index < step ? "completado" : index === step ? "actual" : "pendiente"}`} className={cn("h-1.5 flex-1 rounded-full bg-accent", index <= step && "bg-brand")} key={label} />)}</div><div className="mt-3 flex justify-between text-xs text-muted"><span>{steps[step]}</span><span>{Math.round(((step + 1) / steps.length) * 100)}%</span></div></header>}
    copilot={<OrbitCopilot actionLabel={recommendation} estimatedTime="20 segundos" impact="Mantiene la propuesta clara y acelera la decisión del cliente." onAction={step < 5 ? nextStep : () => setSent(true)} reason="ORBIT prioriza la siguiente decisión necesaria para completar la propuesta." recommendation={recommendation} title="Recomendación comercial" />}
    mainContent={<div className="space-y-6"><SmartCard className="min-h-[26rem]" title={steps[step]} description={step === 4 ? "Revisa la propuesta antes de preparar el envío." : step === 5 ? "La propuesta está lista para compartir con el cliente." : "Selecciona la opción que mejor representa esta experiencia."}>{sent ? <SentState /> : <StepContent step={step} eventType={eventType} setEventType={setEventType} services={services} toggleService={toggleService} duration={duration} setDuration={setDuration} extras={extras} toggleExtra={toggleExtra} totals={totals} />}</SmartCard><QuotationSummary services={services} extras={extras} duration={duration} eventType={eventType} totals={totals} /></div>}
    timeline={null}
    bottomAction={<div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:p-4"><ActionButton disabled={step === 0 || sent} icon={ChevronLeft} label="Atrás" onClick={() => setStep((current) => Math.max(current - 1, 0))} variant="outline" />{step < 5 ? <ActionButton disabled={!canContinue} icon={ChevronRight} iconPosition="end" label={step === 4 ? "Preparar envío" : "Continuar"} onClick={nextStep} /> : <ActionButton disabled={sent} icon={Send} iconPosition="end" label={sent ? "Cotización enviada" : "Enviar cotización"} onClick={() => setSent(true)} />}</div>}
  />;
}

interface StepContentProps {
  step: number;
  eventType?: EventType;
  setEventType: (value: EventType) => void;
  services: Service[];
  toggleService: (value: Service) => void;
  duration: number;
  setDuration: (value: number) => void;
  extras: Extra[];
  toggleExtra: (value: Extra) => void;
  totals: { subtotal: number; extrasTotal: number; total: number; margin: number };
}

function StepContent(props: StepContentProps) {
  if (props.step === 0) return <OptionGrid options={eventTypes.map((label) => ({ label }))} selected={props.eventType ? [props.eventType] : []} onSelect={(value) => props.setEventType(value as EventType)} />;
  if (props.step === 1) return <OptionGrid multiple options={(Object.entries(servicePrices) as [Service, number][]).map(([label, price]) => ({ label, caption: `Desde ${currency.format(price)}` }))} selected={props.services} onSelect={(value) => props.toggleService(value as Service)} />;
  if (props.step === 2) return <OptionGrid options={durationOptions.map((option) => ({ label: option.label, value: String(option.value), caption: option.value === 2 ? "Duración esencial" : option.value === 3 ? "La opción más elegida" : "Experiencia extendida" }))} selected={[String(props.duration)]} onSelect={(value) => props.setDuration(Number(value))} />;
  if (props.step === 3) return <OptionGrid multiple options={(Object.entries(extraPrices) as [Extra, number][]).map(([label, price]) => ({ label, caption: `+ ${currency.format(price)}` }))} selected={props.extras} onSelect={(value) => props.toggleExtra(value as Extra)} />;
  return <Review eventType={props.eventType} services={props.services} duration={props.duration} extras={props.extras} totals={props.totals} readyToSend={props.step === 5} />;
}

function OptionGrid({ options, selected, onSelect, multiple }: { options: { label: string; value?: string; caption?: string }[]; selected: string[]; onSelect: (value: string) => void; multiple?: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2">{options.map(({ label, value = label, caption }) => { const active = selected.includes(value); return <button aria-pressed={active} className={cn("group flex min-h-24 items-center justify-between rounded-xl border bg-background p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50", active && "border-brand/60 bg-accent shadow-md")} key={value} onClick={() => onSelect(value)} type="button"><span><span className="block font-semibold">{label}</span>{caption && <span className="mt-1 block text-xs text-muted">{caption}</span>}</span><span className={cn("flex size-6 items-center justify-center rounded-full border text-brand", active && "border-brand bg-brand text-black")}>{active ? <Check aria-hidden="true" className="size-4" /> : multiple ? <span className="size-2 rounded-full bg-muted/40" /> : null}</span></button>; })}</div>;
}

function Review({ eventType, services, duration, extras, totals, readyToSend }: { eventType?: EventType; services: Service[]; duration: number; extras: Extra[]; totals: StepContentProps["totals"]; readyToSend: boolean }) {
  return <div className="space-y-6"><div className="rounded-xl bg-accent/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Experiencia configurada</p><h3 className="mt-2 text-2xl font-semibold tracking-tight">{eventType ?? "Tipo por definir"}</h3><p className="mt-2 text-sm leading-6 text-muted">{formatServiceSummary(services, `${duration} horas`) || "Sin servicios"}{extras.length ? ` · ${extras.join(" + ")}` : ""}</p></div><dl className="divide-y rounded-xl border px-4"><PriceRow label="Subtotal" value={currency.format(totals.subtotal)} /><PriceRow label="Extras" value={currency.format(totals.extrasTotal)} /><PriceRow label="Total" strong value={currency.format(totals.total)} /><PriceRow label="Margen estimado" value={currency.format(totals.margin)} /></dl>{readyToSend && <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4 text-sm text-success"><Send aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><p>La cotización está completa y lista para enviar al cliente.</p></div>}</div>;
}

function PriceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-4"><dt className="text-sm text-muted">{label}</dt><dd className={strong ? "text-xl font-semibold" : "text-sm font-semibold"}>{value}</dd></div>;
}

function QuotationSummary({ services, extras, duration, eventType, totals }: { services: Service[]; extras: Extra[]; duration: number; eventType?: EventType; totals: StepContentProps["totals"] }) {
  return <section aria-label="Resumen en tiempo real" className="grid gap-3 sm:grid-cols-2"><SmartCard icon={<ReceiptText aria-hidden="true" className="size-5" />} primaryValue={eventType ?? "Sin configurar"} secondaryValue={`${duration} horas`} title="Resumen" /><SmartCard icon={<Layers3 aria-hidden="true" className="size-5" />} primaryValue={`${services.length}`} secondaryValue={services.length ? formatServiceSummary(services, `${duration} horas`) : "Aún no has elegido servicios"} title="Servicios" /><SmartCard icon={<Gift aria-hidden="true" className="size-5" />} primaryValue={`${extras.length}`} secondaryValue={extras.length ? extras.join(" · ") : "Sin extras seleccionados"} title="Extras" /><SmartCard icon={<Sparkles aria-hidden="true" className="size-5" />} primaryValue={currency.format(totals.total)} secondaryValue={`Subtotal ${currency.format(totals.subtotal)}`} title="Precio" /><SmartCard className="sm:col-span-2" icon={<Percent aria-hidden="true" className="size-5" />} primaryValue={currency.format(totals.margin)} secondaryValue="42% estimado · datos simulados" status={<DataStateBadge state="ESTIMATED" />} title="Margen estimado" /></section>;
}

function SentState() {
  return <div className="flex min-h-80 flex-col items-center justify-center text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success"><Check aria-hidden="true" className="size-7" /></span><h3 className="mt-5 text-2xl font-semibold tracking-tight">Cotización enviada</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted">La propuesta quedó lista dentro del mismo proyecto comercial. No se creó ningún registro duplicado.</p></div>;
}
