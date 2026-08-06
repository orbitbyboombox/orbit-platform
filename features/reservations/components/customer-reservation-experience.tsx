"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileCheck2,
  Landmark,
  Smartphone,
  UploadCloud,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { ReservationPreview } from "../data/mock-reservation";

export interface CustomerReservationExperienceProps {
  projectName: string;
  eventDate: string;
  reservation: ReservationPreview;
  onClose: () => void;
  onComplete?: () => void;
}

type PaymentMethod = "Transferencia" | "Flow" | "WebPay";

const steps = ["Reserva tu fecha", "Resumen", "Forma de pago", "Transferencia", "Comprobante", "Validación"] as const;

const recommendations = [
  { title: "Reservar tu fecha", reason: "Tu acuerdo ya fue aceptado.", impact: "Iniciaremos la solicitud para proteger la fecha de tu evento.", time: "2 minutos" },
  { title: "Revisar la reserva", reason: "Preparamos los montos de tu solicitud.", impact: "Sabrás cuánto corresponde al abono y al saldo.", time: "20 segundos" },
  { title: "Elegir forma de pago", reason: "Necesitamos saber cómo prefieres realizar el abono.", impact: "Podrás continuar con las instrucciones correspondientes.", time: "15 segundos" },
  { title: "Copiar datos de transferencia", reason: "Los datos están listos para usar.", impact: "Podrás realizar el abono sin transcribir información.", time: "20 segundos" },
  { title: "Esperando comprobante", reason: "Necesitamos recibir el respaldo del abono.", impact: "BOOMBOX podrá validar tu solicitud de reserva.", time: "30 segundos" },
  { title: "Esperando validación", reason: "Recibimos tu comprobante correctamente.", impact: "Solo BOOMBOX puede confirmar oficialmente la reserva.", time: "Sin acción requerida" },
] as const;

export function CustomerReservationExperience({ projectName, eventDate, reservation, onClose, onComplete }: CustomerReservationExperienceProps) {
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>();
  const [proofName, setProofName] = useState<string>();
  const recommendation = recommendations[step];
  const isComplete = step === steps.length - 1;
  const canAdvance = (step !== 2 || Boolean(paymentMethod)) && (step !== 4 || Boolean(proofName));
  const advance = () => setStep((current) => Math.min(current + 1, steps.length - 1));

  const finish = onComplete ?? onClose;

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={<ReservationHeader eventDate={eventDate} onClose={onClose} projectName={projectName} step={step} />}
      copilot={<OrbitCopilot actionLabel={isComplete ? "Continuar al pago" : recommendation.title} estimatedTime={recommendation.time} impact={recommendation.impact} onAction={isComplete ? finish : canAdvance ? advance : undefined} reason={recommendation.reason} recommendation={recommendation.title} title="Tu siguiente paso" />}
      mainContent={<SmartCard className="min-h-[32rem] p-6 sm:p-8 lg:p-10"><ReservationStep paymentMethod={paymentMethod} proofName={proofName} reservation={reservation} setPaymentMethod={setPaymentMethod} setProofName={setProofName} step={step} /></SmartCard>}
      timeline={<ReservationProgress step={step} />}
      bottomAction={<div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:p-4"><ActionButton disabled={step === 0 || isComplete} icon={ArrowLeft} label="Anterior" onClick={() => setStep((current) => Math.max(current - 1, 0))} variant="outline" /><ActionButton disabled={!canAdvance} icon={isComplete ? CheckCircle2 : undefined} label={isComplete ? "Continuar al pago" : step === 4 ? "Enviar comprobante" : step === 0 ? "Reservar mi fecha" : "Continuar"} onClick={isComplete ? finish : advance} /></div>}
    />
  );
}

function ReservationHeader({ projectName, eventDate, step, onClose }: { projectName: string; eventDate: string; step: number; onClose: () => void }) {
  return <header className="rounded-2xl border bg-card p-5 sm:p-7"><button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver al Portal</button><div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Reserva BOOMBOX</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Reserva tu fecha</h1><p className="mt-3 text-sm leading-6 text-muted sm:text-base">{projectName} · {eventDate}</p></div><StatusBadge label={step === 5 ? "Pendiente de validación" : `Paso ${step + 1} de 6`} variant={step === 5 ? "warning" : "info"} /></div></header>;
}

function ReservationProgress({ step }: { step: number }) {
  return <SmartCard description="La fecha quedará reservada después de la validación de BOOMBOX." title="Tu progreso"><ol className="space-y-3">{steps.map((label, index) => <li className="flex items-center gap-3 text-sm" key={label}><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", index < step && "border-success bg-success/10 text-success", index === step && "border-brand bg-brand text-brand-foreground", index > step && "text-muted")}>{index < step ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}</span><span className={cn(index === step ? "font-semibold text-foreground" : "text-muted")}>{label}</span></li>)}</ol></SmartCard>;
}

function ReservationStep({ step, reservation, paymentMethod, setPaymentMethod, proofName, setProofName }: { step: number; reservation: ReservationPreview; paymentMethod?: PaymentMethod; setPaymentMethod: (value: PaymentMethod) => void; proofName?: string; setProofName: (value?: string) => void }) {
  if (step === 0) return <CenteredStep icon={<CalendarCheck2 aria-hidden="true" className="size-10" />} eyebrow="Tu fecha está disponible" title="Reserva tu gran día"><p>En pocos pasos enviaremos tu solicitud de reserva a BOOMBOX.</p><p>La fecha quedará confirmada únicamente después de la validación interna.</p></CenteredStep>;
  if (step === 1) return <ReservationSummary reservation={reservation} />;
  if (step === 2) return <PaymentMethods onChange={setPaymentMethod} value={paymentMethod} />;
  if (step === 3) return <TransferDetails reservation={reservation} selectedMethod={paymentMethod} />;
  if (step === 4) return <ProofUpload fileName={proofName} onChange={setProofName} />;
  return <CenteredStep icon={<BadgeCheck aria-hidden="true" className="size-10" />} eyebrow="Reserva pendiente de validación" title="Hemos recibido tu comprobante"><p>BOOMBOX validará tu solicitud de reserva.</p><p>Una vez aprobada, la fecha de tu evento quedará oficialmente reservada.</p><div className="mt-6 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">El envío del comprobante no confirma automáticamente tu proyecto.</div></CenteredStep>;
}

function CenteredStep({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[27rem] max-w-2xl flex-col items-center justify-center text-center"><span className="flex size-20 items-center justify-center rounded-3xl bg-brand/10 text-brand">{icon}</span><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2><div className="mt-6 space-y-2 text-base leading-7 text-muted sm:text-lg">{children}</div></div>;
}

function ReservationSummary({ reservation }: { reservation: ReservationPreview }) {
  const rows = [["Total", reservation.total], ["Abono requerido", reservation.requiredDeposit], ["Saldo restante", reservation.remainingBalance]];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 2</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Resumen de reserva</h2><p className="mt-3 text-sm leading-6 text-muted">Estos montos corresponden a la solicitud que revisará BOOMBOX.</p><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value], index) => <div className="grid gap-1 py-6 sm:grid-cols-[12rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className={cn("text-xl font-semibold sm:text-right", index === 1 && "text-brand")}>{value}</dd></div>)}</dl></div>;
}

function PaymentMethods({ value, onChange }: { value?: PaymentMethod; onChange: (value: PaymentMethod) => void }) {
  const methods: Array<{ label: PaymentMethod; icon: typeof Landmark; available: boolean }> = [{ label: "Transferencia", icon: Landmark, available: true }, { label: "Flow", icon: Smartphone, available: false }, { label: "WebPay", icon: CreditCard, available: false }];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 3</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Forma de pago</h2><p className="mt-3 text-sm leading-6 text-muted">Selecciona cómo deseas preparar tu solicitud. Esta pantalla no procesa pagos.</p><div className="mt-8 grid gap-4 sm:grid-cols-3">{methods.map(({ label, icon: Icon, available }) => <button aria-pressed={value === label} className={cn("flex min-h-44 flex-col items-center justify-center rounded-2xl border bg-accent/20 p-6 text-center transition hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", value === label && "border-brand bg-brand/10")} key={label} onClick={() => onChange(label)} type="button"><Icon aria-hidden="true" className="size-7 text-brand" /><span className="mt-4 font-semibold">{label}</span><span className="mt-2 text-xs text-muted">{available ? "Disponible" : "No disponible"}</span></button>)}</div></div>;
}

function TransferDetails({ reservation, selectedMethod }: { reservation: ReservationPreview; selectedMethod?: PaymentMethod }) {
  const [copied, setCopied] = useState(false);
  const details = reservation.bankDetails;
  const copy = async () => {
    await navigator.clipboard.writeText(`${details.bank}\n${details.account}\nRUT ${details.rut}\n${details.email}`);
    setCopied(true);
  };
  const rows = [["Banco", details.bank], ["Cuenta", details.account], ["RUT", details.rut], ["Correo", details.email]];
  return <div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 4</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Datos de transferencia</h2><p className="mt-3 text-sm leading-6 text-muted">Revisa los datos de transferencia antes de continuar.</p></div><StatusBadge label={selectedMethod ?? "Transferencia"} variant="info" /></div><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value]) => <div className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold sm:text-right">{value}</dd></div>)}</dl><ActionButton className="mt-6 w-full sm:w-auto" icon={copied ? CheckCircle2 : Copy} label={copied ? "Datos copiados" : "Copiar datos"} onClick={copy} variant="outline" /></div>;
}

function ProofUpload({ fileName, onChange }: { fileName?: string; onChange: (value?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectFile = (file?: File) => onChange(file?.name);
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); };
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 5</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Adjunta tu comprobante</h2><StatusBadge label={fileName ? "Comprobante adjunto" : "Pendiente"} variant={fileName ? "success" : "warning"} /></div><p className="mt-3 text-sm leading-6 text-muted">Puedes arrastrar un archivo o seleccionarlo desde tu dispositivo.</p><div className={cn("mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center transition", fileName && "border-success/50 bg-success/5")} onDragOver={(event) => event.preventDefault()} onDrop={drop}><span className={cn("flex size-16 items-center justify-center rounded-2xl bg-brand/10 text-brand", fileName && "bg-success/10 text-success")}>{fileName ? <FileCheck2 aria-hidden="true" className="size-8" /> : <UploadCloud aria-hidden="true" className="size-8" />}</span><p className="mt-5 text-lg font-semibold">{fileName ?? "Arrastra tu comprobante aquí"}</p><p className="mt-2 text-sm text-muted">PDF, JPG o PNG · máximo visual sugerido 10 MB</p><ActionButton className="mt-6" icon={fileName ? Building2 : UploadCloud} label={fileName ? "Cambiar archivo" : "Seleccionar archivo"} onClick={() => inputRef.current?.click()} variant="outline" /><input accept=".pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} ref={inputRef} type="file" /></div></div>;
}
