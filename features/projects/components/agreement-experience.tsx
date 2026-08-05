"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  PartyPopper,
  PenLine,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ContractPdfPreviewModel } from "@/features/pdf-generator";
import { cn } from "@/lib/utils";

export interface AgreementExperienceProps {
  agreement: ContractPdfPreviewModel;
  onClose: () => void;
}

const steps = ["Bienvenida", "Tu experiencia", "Acuerdo", "Aceptación", "Firma", "Enviado"] as const;

const recommendations = [
  { title: "Revisar tu experiencia", reason: "Preparamos un resumen simple antes del acuerdo.", impact: "Podrás confirmar que todos los datos estén correctos.", time: "1 minuto" },
  { title: "Revisar el resumen", reason: "Tus servicios y valores ya están disponibles.", impact: "Evitarás diferencias antes de aceptar.", time: "30 segundos" },
  { title: "Leer las condiciones", reason: "El acuerdo está organizado en secciones breves.", impact: "Conocerás claramente los compromisos de ambas partes.", time: "1 minuto" },
  { title: "Esperando aceptación", reason: "Necesitamos que confirmes que leíste las condiciones.", impact: "Podrás avanzar al área de firma.", time: "10 segundos" },
  { title: "Agregar firma", reason: "La aceptación ya fue registrada en esta sesión.", impact: "Enviaremos el acuerdo a validación interna.", time: "20 segundos" },
  { title: "Esperando validación", reason: "Recibimos tu aceptación correctamente.", impact: "El equipo BOOMBOX revisará la información antes del pago.", time: "Sin acción requerida" },
] as const;

export function AgreementExperience({ agreement, onClose }: AgreementExperienceProps) {
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const recommendation = recommendations[step];
  const isComplete = step === steps.length - 1;
  const canAdvance = (step !== 3 || accepted) && (step !== 4 || signed);

  const advance = () => setStep((current) => Math.min(current + 1, steps.length - 1));

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={<AgreementHeader agreement={agreement} onClose={onClose} step={step} />}
      copilot={
        <OrbitCopilot
          actionLabel={isComplete ? "Volver al portal" : recommendation.title}
          estimatedTime={recommendation.time}
          impact={recommendation.impact}
          onAction={isComplete ? onClose : canAdvance ? advance : undefined}
          reason={recommendation.reason}
          recommendation={recommendation.title}
          title="Tu siguiente paso"
        />
      }
      mainContent={
        <SmartCard className="min-h-[32rem] p-6 sm:p-8 lg:p-10">
          <AgreementStep
            accepted={accepted}
            agreement={agreement}
            onAcceptedChange={setAccepted}
            onSignedChange={setSigned}
            signed={signed}
            step={step}
          />
        </SmartCard>
      }
      timeline={<AgreementProgress step={step} />}
      bottomAction={
        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:p-4">
          <ActionButton disabled={step === 0 || isComplete} icon={ArrowLeft} label="Anterior" onClick={() => setStep((current) => Math.max(current - 1, 0))} variant="outline" />
          <ActionButton disabled={!canAdvance} icon={isComplete ? CheckCircle2 : undefined} label={isComplete ? "Volver al portal" : step === 4 ? "Enviar aceptación" : step === 0 ? "Comenzar" : "Continuar"} onClick={isComplete ? onClose : advance} />
        </div>
      }
    />
  );
}

function AgreementHeader({ agreement, step, onClose }: { agreement: ContractPdfPreviewModel; step: number; onClose: () => void }) {
  return (
    <header className="rounded-2xl border bg-card p-5 sm:p-7">
      <button className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" className="size-4" />Volver al Portal</button>
      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Acuerdo BOOMBOX</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Confirmemos tu experiencia</h1><p className="mt-3 text-sm leading-6 text-muted sm:text-base">{agreement.heading.title} · {agreement.metadata.contractId}</p></div>
        <StatusBadge label={step === 5 ? "Aceptación enviada" : `Paso ${step + 1} de 6`} variant={step === 5 ? "success" : "info"} />
      </div>
    </header>
  );
}

function AgreementProgress({ step }: { step: number }) {
  return <SmartCard description="Seis pasos claros para revisar y aceptar tu experiencia." title="Tu progreso"><ol className="space-y-3">{steps.map((label, index) => <li className="flex items-center gap-3 text-sm" key={label}><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", index < step && "border-success bg-success/10 text-success", index === step && "border-brand bg-brand text-brand-foreground", index > step && "text-muted")}>{index < step ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}</span><span className={cn(index === step ? "font-semibold text-foreground" : "text-muted")}>{label}</span></li>)}</ol></SmartCard>;
}

function AgreementStep({ step, agreement, accepted, onAcceptedChange, signed, onSignedChange }: { step: number; agreement: ContractPdfPreviewModel; accepted: boolean; onAcceptedChange: (value: boolean) => void; signed: boolean; onSignedChange: (value: boolean) => void }) {
  if (step === 0) return <CenteredStep icon={<PartyPopper aria-hidden="true" className="size-10" />} eyebrow="Bienvenido" title="Tu experiencia está casi lista"><p>Preparamos todo para que puedas revisar y aceptar con tranquilidad.</p><p>Esto tomará solo unos minutos.</p></CenteredStep>;
  if (step === 1) return <ExperienceReview agreement={agreement} />;
  if (step === 2) return <AgreementClauses agreement={agreement} />;
  if (step === 3) return <Acceptance accepted={accepted} onChange={onAcceptedChange} />;
  if (step === 4) return <SignatureStep onChange={onSignedChange} signed={signed} />;
  return <CenteredStep icon={<CheckCircle2 aria-hidden="true" className="size-10" />} eyebrow="Acuerdo enviado" title="Gracias"><p>Hemos recibido tu aceptación.</p><p>Muy pronto validaremos tu información para continuar con la reserva.</p><div className="mt-6 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">Tu proyecto aún no está confirmado. El pago y la validación interna ocurren después.</div></CenteredStep>;
}

function CenteredStep({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[27rem] max-w-2xl flex-col items-center justify-center text-center"><span className="flex size-20 items-center justify-center rounded-3xl bg-brand/10 text-brand">{icon}</span><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2><div className="mt-6 space-y-2 text-base leading-7 text-muted sm:text-lg">{children}</div></div>;
}

function ExperienceReview({ agreement }: { agreement: ContractPdfPreviewModel }) {
  const total = agreement.commercialSummary.at(-1);
  const rows = [
    ["Proyecto", agreement.heading.title],
    ["Servicios", agreement.services.selected.join(" + ")],
    ["Duración", agreement.services.duration ?? "Duración fija"],
    ["Extras", agreement.services.extras.join(", ") || "Sin extras"],
    ["Traslado", agreement.services.transport],
    ["Total", total ? formatClp(total.amount) : "Por confirmar"],
  ];
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 2</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Revisa tu experiencia</h2><p className="mt-3 text-sm leading-6 text-muted">Todo lo que elegiste, presentado en una sola vista.</p><dl className="mt-8 divide-y rounded-2xl border bg-accent/25 px-5 sm:px-7">{rows.map(([label, value]) => <div className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr] sm:items-center" key={label}><dt className="text-sm text-muted">{label}</dt><dd className={cn("font-semibold sm:text-right", label === "Total" && "text-xl text-brand")}>{value}</dd></div>)}</dl></div>;
}

function AgreementClauses({ agreement }: { agreement: ContractPdfPreviewModel }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 3</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Tu acuerdo</h2><p className="mt-3 text-sm leading-6 text-muted">Organizamos las condiciones en secciones para que encuentres rápidamente lo importante.</p><div className="mt-8 space-y-3">{agreement.clauses.map((clause, index) => <details className="group rounded-2xl border bg-accent/20 p-5 open:bg-accent/40" key={clause.id} open={index === 0}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="flex items-center gap-3"><span className="text-xs tabular-nums text-brand">{String(index + 1).padStart(2, "0")}</span>{clause.title}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted transition group-open:rotate-180" /></summary><p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{clause.content}</p></details>)}</div></div>;
}

function Acceptance({ accepted, onChange }: { accepted: boolean; onChange: (value: boolean) => void }) {
  return <div className="mx-auto max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 4</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Aceptación</h2><p className="mt-3 text-sm leading-6 text-muted">Confirma que revisaste el acuerdo antes de agregar tu firma.</p><label className={cn("mt-10 flex cursor-pointer items-start gap-4 rounded-2xl border bg-accent/20 p-5 transition hover:border-brand/50 sm:p-6", accepted && "border-success/50 bg-success/5")}><input checked={accepted} className="mt-1 size-5 accent-[var(--brand)]" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span><span className="block font-semibold">He leído y acepto las condiciones del servicio.</span><span className="mt-2 block text-sm leading-6 text-muted">Esta aceptación no confirma el proyecto ni procesa ningún pago.</span></span></label><div className="mt-6 flex items-center gap-3 rounded-xl border border-info/20 bg-info/10 p-4 text-sm text-info"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />Tu información será revisada por el equipo BOOMBOX antes de continuar.</div></div>;
}

function SignatureStep({ signed, onChange }: { signed: boolean; onChange: (value: boolean) => void }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Paso 5</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tu firma</h2><StatusBadge label={signed ? "Firma agregada" : "Firma pendiente"} variant={signed ? "success" : "warning"} /></div><p className="mt-3 text-sm leading-6 text-muted">Firma con mouse, lápiz o directamente con tu dedo. El trazo permanece solo en esta sesión.</p><SignaturePad onChange={onChange} /></div>;
}

function SignaturePad({ onChange }: { onChange: (value: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const context = canvas.getContext("2d");
      context?.scale(ratio, ratio);
      if (context) { context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = 2.5; context.strokeStyle = "#f59e0b"; }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.beginPath();
    context?.moveTo(position.x, position.y);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.lineTo(position.x, position.y);
    context?.stroke();
    if (!hasInk) { setHasInk(true); onChange(true); }
  };

  const stop = () => { drawingRef.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(false);
  };

  return <div className="mt-8"><div className="relative overflow-hidden rounded-2xl border border-dashed bg-background"><canvas aria-label="Área para dibujar la firma" className="h-64 w-full touch-none cursor-crosshair" onPointerCancel={stop} onPointerDown={start} onPointerLeave={stop} onPointerMove={draw} onPointerUp={stop} ref={canvasRef} /><div aria-hidden="true" className="pointer-events-none absolute inset-x-8 bottom-12 border-b border-muted/40" /><div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs text-muted">Firma aquí</div></div><div className="mt-4 flex items-center justify-between gap-4"><span className="inline-flex items-center gap-2 text-sm text-muted"><PenLine aria-hidden="true" className="size-4" />Compatible con mouse y pantalla táctil</span><ActionButton disabled={!hasInk} icon={RotateCcw} label="Limpiar" onClick={clear} variant="outline" /></div></div>;
}

function formatClp(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
