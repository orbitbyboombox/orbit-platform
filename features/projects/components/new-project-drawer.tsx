"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useId, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { projectOrigins, projectTypes, type Project, type ProjectDraft, type ProjectOrigin, type ProjectType } from "../types/project";

const steps = ["Contacto", "Evento", "Contexto comercial", "Revisión"] as const;
const initialDraft: ProjectDraft = { client: { name: "", email: "", phone: "" }, event: { date: "", time: "00:00", location: "Por confirmar", city: "" }, services: [], notes: "" };
const typeLabels: Record<ProjectType, string> = { Wedding: "Matrimonio", Corporate: "Corporativo", Birthday: "Cumpleaños", Private: "Privado", Other: "Otro" };
const originLabels: Record<ProjectOrigin, string> = { WhatsApp: "WhatsApp", Instagram: "Instagram", Google: "Google", Website: "Página Web", Referral: "Referido", FormerClient: "Cliente antiguo", Other: "Otro" };

export interface NewProjectDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (project: Project) => void;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return <label className="block text-sm font-medium" htmlFor={id}>{label}<input className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-foreground/20 focus:ring-2 focus:ring-brand/40" id={id} {...props} /></label>;
}

export function NewProjectDrawer({ open, onClose, onCreate }: NewProjectDrawerProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  if (!open) return null;

  const resetAndClose = () => { setStep(0); setDraft(initialDraft); onClose(); };
  const updateClient = (field: keyof ProjectDraft["client"], value: string) => setDraft((current) => ({ ...current, client: { ...current.client, [field]: value } }));
  const updateEvent = (field: keyof ProjectDraft["event"], value: string) => setDraft((current) => ({ ...current, event: { ...current.event, [field]: value } }));
  const canContinue = step === 0 ? Boolean(draft.client.name && draft.client.email && draft.client.phone) : step === 1 ? Boolean(draft.type && draft.event.date && draft.event.city) : step === 2 ? Boolean(draft.origin) : true;
  const createProject = () => {
    if (!draft.type || !draft.origin) return;
    const project: Project = {
      id: `mock-${Date.now()}`,
      name: draft.client.company || draft.client.name,
      type: draft.type,
      client: draft.client,
      event: draft.event,
      services: [],
      status: "Upcoming",
      health: "Healthy",
      stage: "Primer contacto",
      score: 60,
      commercialStage: "New",
      origin: draft.origin,
      notes: draft.notes,
    };
    onCreate(project);
    resetAndClose();
  };

  return <><button aria-label="Cerrar panel de nuevo proyecto" className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-[2px]" onClick={resetAndClose} type="button" /><aside aria-label="Nuevo proyecto" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-card shadow-2xl"><header className="flex items-start justify-between border-b p-5 sm:p-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Paso {step + 1} de {steps.length}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{steps[step]}</h2></div><Button aria-label="Cerrar panel" onClick={resetAndClose} size="icon" variant="ghost"><X aria-hidden="true" className="size-4" /></Button></header><div className="flex gap-1.5 border-b px-5 py-4 sm:px-7">{steps.map((label, index) => <span aria-label={`${label}: ${index < step ? "completado" : index === step ? "actual" : "pendiente"}`} className={cn("h-1.5 flex-1 rounded-full bg-accent", index <= step && "bg-brand")} key={label} />)}</div><div className="flex-1 overflow-y-auto p-5 sm:p-7">{step === 0 && <div className="space-y-5"><Field autoComplete="name" label="Nombre" onChange={(event) => updateClient("name", event.target.value)} required value={draft.client.name} /><Field autoComplete="organization" label="Empresa (opcional)" onChange={(event) => updateClient("company", event.target.value)} value={draft.client.company ?? ""} /><Field autoComplete="email" label="Correo" onChange={(event) => updateClient("email", event.target.value)} required type="email" value={draft.client.email} /><Field autoComplete="tel" label="WhatsApp" onChange={(event) => updateClient("phone", event.target.value)} required type="tel" value={draft.client.phone} /></div>}{step === 1 && <div className="space-y-6"><div><p className="mb-3 text-sm font-medium">Tipo de evento</p><ChoiceGrid onSelect={(type) => setDraft((current) => ({ ...current, type }))} options={projectTypes} selected={draft.type} /></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Fecha" onChange={(event) => updateEvent("date", event.target.value)} required type="date" value={draft.event.date} /><Field label="Ciudad" onChange={(event) => updateEvent("city", event.target.value)} required value={draft.event.city} /></div></div>}{step === 2 && <CommercialContext draft={draft} setDraft={setDraft} />}{step === 3 && <Summary draft={draft} />}</div><footer className="flex items-center justify-between gap-3 border-t p-5 sm:p-7"><ActionButton disabled={step === 0} icon={ChevronLeft} label="Atrás" onClick={() => setStep((current) => current - 1)} variant="outline" />{step < steps.length - 1 ? <ActionButton disabled={!canContinue} icon={ChevronRight} iconPosition="end" label="Continuar" onClick={() => setStep((current) => current + 1)} /> : <ActionButton icon={Check} label="Crear proyecto" onClick={createProject} />}</footer></aside></>;
}

function ChoiceGrid({ options, selected, onSelect }: { options: readonly ProjectType[]; selected?: ProjectType; onSelect: (value: ProjectType) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{options.map((option) => { const isSelected = selected === option; return <button aria-pressed={isSelected} className={cn("flex min-h-18 items-center justify-between rounded-xl border bg-background p-4 text-left text-sm font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50", isSelected && "border-brand/60 bg-accent")} key={option} onClick={() => onSelect(option)} type="button"><span>{typeLabels[option]}</span>{isSelected && <Check aria-hidden="true" className="size-4 text-brand" />}</button>; })}</div>;
}

function CommercialContext({ draft, setDraft }: { draft: ProjectDraft; setDraft: React.Dispatch<React.SetStateAction<ProjectDraft>> }) {
  const originId = useId();
  const notesId = useId();
  return <div className="space-y-5"><label className="block text-sm font-medium" htmlFor={originId}>Origen<select className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40" id={originId} onChange={(event) => setDraft((current) => ({ ...current, origin: event.target.value as ProjectOrigin }))} required value={draft.origin ?? ""}><option disabled value="">Selecciona un origen</option>{projectOrigins.map((origin) => <option key={origin} value={origin}>{originLabels[origin]}</option>)}</select></label><label className="block text-sm font-medium" htmlFor={notesId}>Observaciones<textarea className="mt-2 min-h-36 w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-brand/40" id={notesId} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Contexto, necesidades o próximos pasos..." value={draft.notes} /></label></div>;
}

function Summary({ draft }: { draft: ProjectDraft }) {
  const sections = [
    { label: "Nombre", value: draft.client.name },
    { label: "Empresa", value: draft.client.company || "No informada" },
    { label: "Contacto", value: `${draft.client.email} · ${draft.client.phone}` },
    { label: "Evento", value: `${draft.type ? typeLabels[draft.type] : "Sin tipo"} · ${draft.event.date}` },
    { label: "Ciudad", value: draft.event.city },
    { label: "Origen", value: draft.origin ? originLabels[draft.origin] : undefined },
    { label: "Observaciones", value: draft.notes || "Sin observaciones" },
  ];
  return <dl className="divide-y rounded-xl border bg-background px-4">{sections.map(({ label, value }) => <div className="py-4" key={label}><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1.5 text-sm leading-6">{value || "Sin información"}</dd></div>)}</dl>;
}
