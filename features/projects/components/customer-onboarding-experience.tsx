"use client";

import { useId, useState } from "react";
import { ArrowLeft, BadgeCheck, Check, ChevronDown, CreditCard, FileSignature, Landmark, PartyPopper, PenLine, ShieldCheck, Smartphone } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { formatServiceSummary } from "@/lib/format-service-summary";
import type { Project } from "../types/project";

export interface CustomerOnboardingExperienceProps {
  project: Project;
  qrIncluded: boolean;
  vatLabel: string;
  onClose: () => void;
}

interface CustomerData {
  name: string;
  email: string;
  whatsapp: string;
  address: string;
  date: string;
  time: string;
}

const steps = ["Bienvenida", "Tus datos", "Tu experiencia", "Condiciones", "Firma", "Forma de pago", "Confirmación"] as const;
const recommendations = [
  { title: "Comenzar la confirmación", reason: "Tu cotización ya fue aceptada.", impact: "En pocos minutos dejaremos tu experiencia preparada.", time: "2 minutos" },
  { title: "Confirmar tus datos", reason: "Necesitamos validar la información de coordinación.", impact: "Evitaremos errores antes del evento.", time: "30 segundos" },
  { title: "Revisar tu experiencia", reason: "Este es el resumen de lo que elegiste.", impact: "Podrás confirmar que todo está correcto.", time: "20 segundos" },
  { title: "Revisar las condiciones", reason: "Las organizamos en secciones breves.", impact: "Sabrás qué esperar en cada etapa.", time: "40 segundos" },
  { title: "Esperando firma", reason: "Tus datos y experiencia ya están revisados.", impact: "La firma deja tu aceptación preparada.", time: "20 segundos" },
  { title: "Esperando comprobante", reason: "Solo falta elegir cómo prefieres pagar.", impact: "Tu proyecto quedará listo para confirmar.", time: "20 segundos" },
  { title: "Proyecto listo para confirmar", reason: "Completaste todos los pasos.", impact: "El equipo BOOMBOX podrá comenzar la coordinación.", time: "Listo" },
] as const;

export function CustomerOnboardingExperience({ project, qrIncluded, vatLabel, onClose }: CustomerOnboardingExperienceProps) {
  const [step, setStep] = useState(0);
  const [signed, setSigned] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>();
  const [customer, setCustomer] = useState<CustomerData>({
    name: project.client.name,
    email: project.client.email,
    whatsapp: project.client.phone,
    address: [project.event.location, project.event.city].filter(Boolean).join(", "),
    date: project.event.date,
    time: project.event.time,
  });
  const recommendation = recommendations[step];
  const dataComplete = Object.values(customer).every((value) => value.trim().length > 0);
  const canContinue = step !== 1 || dataComplete;
  const actionLabel = step === 0 ? "Comenzar" : step === 6 ? "Volver al Proyecto" : "Continuar";

  const advance = () => {
    if (step === 6) return onClose();
    setStep((current) => Math.min(current + 1, 6));
  };

  return <WorkspaceLayout
    className="max-w-none p-0"
    header={<OnboardingHeader onClose={onClose} project={project} step={step} />}
    copilot={<OrbitCopilot actionLabel={recommendation.title} estimatedTime={recommendation.time} impact={recommendation.impact} onAction={advance} reason={recommendation.reason} recommendation={recommendation.title} title="Tu siguiente paso" />}
    mainContent={<SmartCard className="min-h-[30rem] p-6 sm:p-8 lg:p-10"><StepContent customer={customer} onCustomerChange={setCustomer} onPaymentChange={setPaymentMethod} onSignedChange={setSigned} paymentMethod={paymentMethod} project={project} qrIncluded={qrIncluded} signed={signed} step={step} vatLabel={vatLabel} /></SmartCard>}
    timeline={<StepProgress step={step} />}
    bottomAction={<div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:p-4"><ActionButton disabled={step === 0} icon={ArrowLeft} label="Anterior" onClick={() => setStep((current) => Math.max(current - 1, 0))} variant="outline" /><ActionButton disabled={!canContinue || (step === 4 && !signed) || (step === 5 && !paymentMethod)} icon={step === 6 ? BadgeCheck : undefined} label={actionLabel} onClick={advance} /></div>}
  />;
}

function OnboardingHeader({ project, step, onClose }: { project: Project; step: number; onClose: () => void }) {
  return <header className="rounded-2xl border bg-card p-5 sm:p-7"><button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver al proyecto</button><div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">BOOMBOX Experience</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Confirmemos tu experiencia</h1><p className="mt-3 text-sm leading-6 text-muted sm:text-base">{project.client.name} · {project.name}</p></div><StatusBadge label={`Paso ${step + 1} de 7`} variant={step === 6 ? "success" : "info"} /></div></header>;
}

function StepProgress({ step }: { step: number }) {
  return <SmartCard description="Siete pasos simples para dejar todo preparado." title="Tu progreso"><ol className="space-y-3">{steps.map((label, index) => <li className="flex items-center gap-3 text-sm" key={label}><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", index < step && "border-success bg-success/10 text-success", index === step && "border-brand bg-brand text-brand-foreground", index > step && "text-muted")}>{index < step ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}</span><span className={cn(index === step ? "font-semibold text-foreground" : "text-muted")}>{label}</span></li>)}</ol></SmartCard>;
}

function StepContent(props: { step: number; project: Project; customer: CustomerData; onCustomerChange: (value: CustomerData) => void; signed: boolean; onSignedChange: (value: boolean) => void; paymentMethod?: string; onPaymentChange: (value: string) => void; qrIncluded: boolean; vatLabel: string }) {
  const { step } = props;
  if (step === 0) return <CenteredStep icon={<PartyPopper aria-hidden="true" className="size-10" />} eyebrow="Bienvenido a BOOMBOX" title="¡Excelente noticia!"><p>Estamos muy felices de acompañarte en este gran día.</p><p>En pocos minutos dejaremos todo confirmado.</p></CenteredStep>;
  if (step === 1) return <CustomerForm customer={props.customer} onChange={props.onCustomerChange} />;
  if (step === 2) return <ExperienceSummary project={props.project} qrIncluded={props.qrIncluded} vatLabel={props.vatLabel} />;
  if (step === 3) return <Conditions />;
  if (step === 4) return <Signature signed={props.signed} onChange={props.onSignedChange} />;
  if (step === 5) return <PaymentMethod onChange={props.onPaymentChange} value={props.paymentMethod} />;
  return <CenteredStep icon={<PartyPopper aria-hidden="true" className="size-10" />} eyebrow="Proyecto confirmado" title="¡Todo listo!"><p>Tu experiencia BOOMBOX quedó confirmada.</p><p>Muy pronto recibirás toda la información de coordinación de tu evento.</p><p>Gracias por confiar en nosotros.</p></CenteredStep>;
}

function CenteredStep({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[25rem] max-w-2xl flex-col items-center justify-center text-center"><span className="flex size-20 items-center justify-center rounded-3xl bg-brand/10 text-brand">{icon}</span><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2><div className="mt-6 space-y-2 text-base leading-7 text-muted sm:text-lg">{children}</div></div>;
}

function CustomerForm({ customer, onChange }: { customer: CustomerData; onChange: (value: CustomerData) => void }) {
  const fields: Array<{ key: keyof CustomerData; label: string; type?: string }> = [{ key: "name", label: "Nombre" }, { key: "email", label: "Correo", type: "email" }, { key: "whatsapp", label: "WhatsApp", type: "tel" }, { key: "address", label: "Dirección del evento" }, { key: "date", label: "Fecha" }, { key: "time", label: "Horario" }];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 2</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Confirmar tus datos</h2><p className="mt-3 text-sm leading-6 text-muted">Los precargamos desde tu proyecto. Puedes corregirlos antes de continuar.</p><div className="mt-8 grid gap-5 sm:grid-cols-2">{fields.map((field) => <EditableField key={field.key} label={field.label} onChange={(value) => onChange({ ...customer, [field.key]: value })} type={field.type} value={customer[field.key]} />)}</div></div>;
}

function EditableField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const id = useId();
  return <label className="grid gap-2 text-sm font-medium" htmlFor={id}>{label}<input className="h-12 rounded-xl border bg-background px-4 text-base outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20" id={id} onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function ExperienceSummary({ project, qrIncluded, vatLabel }: { project: Project; qrIncluded: boolean; vatLabel: string }) {
  const rows = [["Servicio", project.services.length ? formatServiceSummary(project.services) : "Experiencia BOOMBOX"], ["Duración", "Según cotización aceptada"], ["Extras", qrIncluded ? "QR incluido" : "Según propuesta aceptada"], ["Traslado", `${project.event.city} · según cotización`], ["Total", `Según cotización aceptada · ${vatLabel}`]];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 3</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Resumen de tu experiencia</h2><p className="mt-3 text-sm leading-6 text-muted">Una vista simple y final de lo que elegiste.</p><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value]) => <div className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold sm:text-right">{value}</dd></div>)}</dl></div>;
}

function Conditions() {
  const items = [["Tu experiencia", "Prepararemos los servicios acordados en la cotización aceptada."], ["Coordinación", "El equipo BOOMBOX confirmará contigo los detalles antes del evento."], ["Cambios y reprogramación", "Si necesitas un cambio, contáctanos para revisar disponibilidad y alternativas."], ["Material del evento", "La entrega y el uso del material se realizarán según la experiencia seleccionada."]];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 4</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Condiciones</h2><p className="mt-3 text-sm leading-6 text-muted">Todo lo importante, organizado en secciones breves.</p><div className="mt-8 space-y-3">{items.map(([title, copy]) => <details className="group rounded-2xl border bg-accent/20 p-5 open:bg-accent/40" key={title}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"><span>{title}</span><ChevronDown aria-hidden="true" className="size-4 text-muted transition group-open:rotate-180" /></summary><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">{copy}</p></details>)}</div></div>;
}

function Signature({ signed, onChange }: { signed: boolean; onChange: (value: boolean) => void }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 5</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Firma</h2><StatusBadge label={signed ? "Firma registrada" : "Firma pendiente"} variant={signed ? "success" : "warning"} /></div><p className="mt-3 text-sm leading-6 text-muted">Una confirmación simple para continuar. La firma digital se gestiona desde el acuerdo del proyecto.</p><button aria-pressed={signed} className={cn("mt-8 flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition hover:border-brand/60 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", signed && "border-success bg-success/5")} onClick={() => onChange(!signed)} type="button">{signed ? <BadgeCheck aria-hidden="true" className="size-10 text-success" /> : <PenLine aria-hidden="true" className="size-10 text-brand" />}<span className="mt-5 text-lg font-semibold">{signed ? "Firma agregada" : "Agregar firma"}</span><span className="mt-2 text-sm text-muted">{signed ? "Selecciona nuevamente para editarla." : "Firma disponible desde el acuerdo"}</span></button></div>;
}

function PaymentMethod({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const methods = [{ label: "Transferencia", icon: Landmark }, { label: "Flow", icon: Smartphone }, { label: "WebPay", icon: CreditCard }];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 6</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Forma de pago</h2><p className="mt-3 text-sm leading-6 text-muted">Elige tu alternativa preferida. No realizaremos ningún cobro en esta pantalla.</p><div className="mt-8 grid gap-4 sm:grid-cols-3">{methods.map(({ label, icon: Icon }) => <button aria-pressed={value === label} className={cn("flex min-h-40 flex-col items-center justify-center rounded-2xl border bg-accent/20 p-6 text-center transition hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", value === label && "border-brand bg-brand/10")} key={label} onClick={() => onChange(label)} type="button"><Icon aria-hidden="true" className="size-7 text-brand" /><span className="mt-4 font-semibold">{label}</span>{value === label && <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success"><ShieldCheck aria-hidden="true" className="size-3.5" />Seleccionado</span>}</button>)}</div><div className="mt-6 flex items-center gap-3 rounded-xl bg-accent/50 p-4 text-sm text-muted"><FileSignature aria-hidden="true" className="size-5 shrink-0 text-brand" />Esta selección es solo informativa y no procesa pagos.</div></div>;
}
