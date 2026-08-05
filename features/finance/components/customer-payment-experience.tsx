"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileCheck2,
  Landmark,
  ReceiptText,
  UploadCloud,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  calculatePaymentAmount,
  calculateReservationDeposit,
  getPaymentMethodRule,
  PAYMENT_METHOD_RULES,
  RESERVATION_DEPOSIT_RATE,
  type PaymentMethodId,
} from "@/features/business-core";
import { cn } from "@/lib/utils";
import type { PaymentPreview } from "../data/mock-payment";

export type CustomerPaymentStatus =
  | "PENDING_PAYMENT"
  | "PROOF_UPLOADED"
  | "PENDING_VALIDATION"
  | "PAYMENT_APPROVED"
  | "RESERVATION_CONFIRMED";

export interface CustomerPaymentExperienceProps {
  projectName: string;
  payment: PaymentPreview;
  onClose: () => void;
}

const steps = ["Resumen", "Forma de pago", "Pago", "Comprobante", "Validación"] as const;

const statusLabels: Readonly<Record<CustomerPaymentStatus, string>> = {
  PENDING_PAYMENT: "Pago pendiente",
  PROOF_UPLOADED: "Comprobante adjunto",
  PENDING_VALIDATION: "Pendiente de validación",
  PAYMENT_APPROVED: "Pago aprobado",
  RESERVATION_CONFIRMED: "Reserva confirmada",
};

export function CustomerPaymentExperience({ projectName, payment, onClose }: CustomerPaymentExperienceProps) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<PaymentMethodId>();
  const [proofName, setProofName] = useState<string>();
  const [status, setStatus] = useState<CustomerPaymentStatus>("PENDING_PAYMENT");
  const deposit = calculateReservationDeposit(payment.reservationTotal);
  const remaining = { ...payment.reservationTotal, amount: payment.reservationTotal.amount - deposit.amount };
  const recommendation = status === "PROOF_UPLOADED" ? "Enviar comprobante" : status === "PENDING_VALIDATION" ? "Esperando validación" : method ? "Completar pago" : "Seleccionar forma de pago";
  const isComplete = step === 4;

  const advance = () => {
    if (step === 2 && method === "MERCADO_PAGO") {
      setStatus("PENDING_VALIDATION");
      setStep(4);
      return;
    }
    if (step === 3) {
      setStatus("PENDING_VALIDATION");
      setStep(4);
      return;
    }
    setStep((current) => Math.min(current + 1, 4));
  };

  const canAdvance = (step !== 1 || Boolean(method)) && (step !== 3 || Boolean(proofName));

  return <WorkspaceLayout
    className="max-w-none p-0"
    header={<PaymentHeader onClose={onClose} projectName={projectName} status={status} step={step} />}
    copilot={<OrbitCopilot actionLabel={isComplete ? "Volver al portal" : recommendation} estimatedTime={isComplete ? "Sin acción requerida" : "30 segundos"} impact={isComplete ? "BOOMBOX revisará el pago antes de reservar la fecha." : "Podrás enviar tu solicitud a validación."} onAction={isComplete ? onClose : canAdvance ? advance : undefined} reason={isComplete ? "La información fue recibida correctamente." : "Tu reserva necesita completar el abono requerido."} recommendation={recommendation} title="Tu siguiente paso" />}
    mainContent={<SmartCard className="min-h-[32rem] p-6 sm:p-8 lg:p-10"><PaymentStep deposit={deposit.amount} method={method} onMethodChange={setMethod} onProceed={advance} onProofChange={(name) => { setProofName(name); setStatus(name ? "PROOF_UPLOADED" : "PENDING_PAYMENT"); }} payment={payment} proofName={proofName} remaining={remaining.amount} status={status} step={step} /></SmartCard>}
    timeline={<PaymentProgress status={status} step={step} />}
    bottomAction={<div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:p-4"><ActionButton disabled={step === 0 || isComplete} icon={ArrowLeft} label="Anterior" onClick={() => setStep((current) => Math.max(current - 1, 0))} variant="outline" /><ActionButton disabled={!canAdvance} icon={isComplete ? CheckCircle2 : undefined} label={isComplete ? "Volver al portal" : step === 2 && method === "MERCADO_PAGO" ? "Pagar con Mercado Pago" : step === 3 ? "Enviar comprobante" : "Continuar"} onClick={isComplete ? onClose : advance} /></div>}
  />;
}

function PaymentHeader({ projectName, step, status, onClose }: { projectName: string; step: number; status: CustomerPaymentStatus; onClose: () => void }) {
  return <header className="rounded-2xl border bg-card p-5 sm:p-7"><button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver al Portal</button><div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Pago de reserva</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Reserva tu fecha</h1><p className="mt-3 text-sm leading-6 text-muted sm:text-base">{projectName}</p></div><StatusBadge label={step === 4 ? statusLabels[status] : `Paso ${step + 1} de 5`} variant={step === 4 ? "warning" : "info"} /></div></header>;
}

function PaymentProgress({ step, status }: { step: number; status: CustomerPaymentStatus }) {
  return <SmartCard description="La reserva solo se confirma después de la validación de BOOMBOX." title="Estado del pago"><div className="mb-5"><StatusBadge label={statusLabels[status]} variant={status === "PENDING_VALIDATION" ? "warning" : status === "PROOF_UPLOADED" ? "info" : "neutral"} /></div><ol className="space-y-3">{steps.map((label, index) => <li className="flex items-center gap-3 text-sm" key={label}><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", index < step && "border-success bg-success/10 text-success", index === step && "border-brand bg-brand text-brand-foreground", index > step && "text-muted")}>{index < step ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}</span><span className={cn(index === step ? "font-semibold text-foreground" : "text-muted")}>{label}</span></li>)}</ol></SmartCard>;
}

function PaymentStep({ step, payment, deposit, remaining, method, onMethodChange, onProceed, proofName, onProofChange, status }: { step: number; payment: PaymentPreview; deposit: number; remaining: number; method?: PaymentMethodId; onMethodChange: (value: PaymentMethodId) => void; onProceed: () => void; proofName?: string; onProofChange: (value?: string) => void; status: CustomerPaymentStatus }) {
  if (step === 0) return <PaymentSummary deposit={deposit} payment={payment} remaining={remaining} />;
  if (step === 1) return <PaymentMethodSelector onChange={onMethodChange} value={method} />;
  if (step === 2 && method === "MERCADO_PAGO") return <MercadoPagoSummary amount={deposit} />;
  if (step === 2) return <BankTransferDetails onUpload={onProceed} payment={payment} />;
  if (step === 3) return <ProofUpload fileName={proofName} onChange={onProofChange} />;
  return <PaymentPending status={status} />;
}

function PaymentSummary({ payment, deposit, remaining }: { payment: PaymentPreview; deposit: number; remaining: number }) {
  const rows = [["Valor total", payment.reservationTotal.amount], [`Abono requerido (${RESERVATION_DEPOSIT_RATE * 100}%)`, deposit], ["Saldo pendiente", remaining]];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 1</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Resumen de reserva</h2><p className="mt-3 text-sm leading-6 text-muted">Revisa los montos antes de elegir cómo realizar el abono.</p><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, amount], index) => <div className="grid gap-1 py-6 sm:grid-cols-[14rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className={cn("text-xl font-semibold sm:text-right", index === 1 && "text-brand")}>{formatClp(Number(amount))}</dd></div>)}</dl></div>;
}

function PaymentMethodSelector({ value, onChange }: { value?: PaymentMethodId; onChange: (value: PaymentMethodId) => void }) {
  const methods: PaymentMethodId[] = ["BANK_TRANSFER", "MERCADO_PAGO"];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 2</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Selecciona la forma de pago</h2><p className="mt-3 text-sm leading-6 text-muted">Transferencia no tiene costo adicional. Mercado Pago incluye procesamiento electrónico.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{methods.map((method) => { const rule = PAYMENT_METHOD_RULES[method]; const Icon = method === "BANK_TRANSFER" ? Landmark : CreditCard; return <button aria-pressed={value === method} className={cn("flex min-h-48 flex-col items-center justify-center rounded-2xl border bg-accent/20 p-6 text-center transition hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", value === method && "border-brand bg-brand/10")} key={method} onClick={() => onChange(method)} type="button"><span className="flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon aria-hidden="true" className="size-6" /></span><span className="mt-4 font-semibold">{rule.name}</span><span className="mt-2 text-sm text-muted">Cargo por procesamiento: {formatPercent(rule.processingRate)}</span></button>; })}</div><p className="mt-5 text-xs text-muted">{getPaymentMethodRule("FLOW").name} permanece preparado para integración futura.</p></div>;
}

function BankTransferDetails({ payment, onUpload }: { payment: PaymentPreview; onUpload: () => void }) {
  const [copied, setCopied] = useState(false);
  const details = payment.bankDetails;
  const rows = [["Banco", details.bank], ["Tipo de cuenta", details.accountType], ["Número de cuenta", details.accountNumber], ["RUT", details.rut], ["Correo", details.email]];
  const copy = async () => { await navigator.clipboard.writeText(rows.map(([label, value]) => `${label}: ${value}`).join("\n")); setCopied(true); };
  return <div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Transferencia</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Datos bancarios</h2><p className="mt-3 text-sm leading-6 text-muted">Sin cargo adicional por procesamiento.</p></div><StatusBadge label={`Cargo ${formatPercent(getPaymentMethodRule("BANK_TRANSFER").processingRate)}`} variant="success" /></div><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value]) => <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-semibold sm:text-right">{value}</dd></div>)}</dl><div className="mt-6 flex flex-col gap-2 sm:flex-row"><ActionButton icon={copied ? CheckCircle2 : Copy} label={copied ? "Datos copiados" : "Copiar datos"} onClick={copy} variant="outline" /><ActionButton icon={UploadCloud} label="Subir comprobante" onClick={onUpload} /></div></div>;
}

function MercadoPagoSummary({ amount }: { amount: number }) {
  const quote = calculatePaymentAmount({ amount, currency: "CLP" }, "MERCADO_PAGO");
  const rule = getPaymentMethodRule("MERCADO_PAGO");
  const rows = [["Total", quote.baseAmount.amount], ["Cargo procesamiento", quote.processingCharge.amount], ["Total a pagar", quote.totalToPay.amount]];
  return <div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Mercado Pago</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Pago seguro mediante Mercado Pago</h2></div><StatusBadge label={`Cargo ${formatPercent(rule.processingRate)}`} variant="warning" /></div><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value], index) => <div className="grid gap-1 py-6 sm:grid-cols-[14rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className={cn("text-xl font-semibold sm:text-right", index === 2 && "text-brand")}>{formatClp(Number(value))}</dd></div>)}</dl><div className="mt-6 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning">Los pagos mediante plataformas electrónicas consideran un cargo por procesamiento del {formatPercent(rule.processingRate)}.</div></div>;
}

function ProofUpload({ fileName, onChange }: { fileName?: string; onChange: (value?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const choose = (file?: File) => onChange(file?.name);
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); choose(event.dataTransfer.files[0]); };
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Comprobante</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sube tu comprobante</h2><StatusBadge label={fileName ? "Comprobante adjunto" : "Pago pendiente"} variant={fileName ? "success" : "warning"} /></div><div className={cn("mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center", fileName && "border-success/50 bg-success/5")} onDragOver={(event) => event.preventDefault()} onDrop={drop}><span className="flex size-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">{fileName ? <FileCheck2 aria-hidden="true" className="size-8 text-success" /> : <UploadCloud aria-hidden="true" className="size-8" />}</span><p className="mt-5 text-lg font-semibold">{fileName ?? "Arrastra tu comprobante aquí"}</p><p className="mt-2 text-sm text-muted">PDF, JPG o PNG</p><ActionButton className="mt-6" label={fileName ? "Cambiar archivo" : "Seleccionar archivo"} onClick={() => inputRef.current?.click()} variant="outline" /><input accept=".pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} ref={inputRef} type="file" /></div></div>;
}

function PaymentPending({ status }: { status: CustomerPaymentStatus }) {
  return <div className="mx-auto flex min-h-[27rem] max-w-2xl flex-col items-center justify-center text-center"><span className="flex size-20 items-center justify-center rounded-3xl bg-brand/10 text-brand"><BadgeCheck aria-hidden="true" className="size-10" /></span><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{statusLabels[status]}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">BOOMBOX revisará tu pago</h2><p className="mt-6 text-base leading-7 text-muted sm:text-lg">La reserva no se confirma automáticamente. Te avisaremos cuando el pago sea aprobado y la fecha quede oficialmente reservada.</p><div className="mt-6 flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning"><ReceiptText aria-hidden="true" className="size-5" />Validación interna pendiente</div></div>;
}

function formatClp(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

function formatPercent(rate: number) {
  return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 0 }).format(rate);
}
