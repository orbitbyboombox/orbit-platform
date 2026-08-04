"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { projectServices, projectTypes, type Project, type ProjectDraft, type ProjectService, type ProjectType } from "../types/project";

const steps = ["Event Type", "Client", "Event", "Services", "Review"] as const;
const initialDraft: ProjectDraft = { client: { name: "", email: "", phone: "" }, event: { date: "", time: "", location: "", city: "" }, services: [] };

export interface NewProjectDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (project: Project) => void;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = `project-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label className="block text-sm font-medium" htmlFor={id}>{label}<input className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2" id={id} {...props} /></label>;
}

export function NewProjectDrawer({ open, onClose, onCreate }: NewProjectDrawerProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  if (!open) return null;

  const resetAndClose = () => { setStep(0); setDraft(initialDraft); onClose(); };
  const updateClient = (field: keyof ProjectDraft["client"], value: string) => setDraft((current) => ({ ...current, client: { ...current.client, [field]: value } }));
  const updateEvent = (field: keyof ProjectDraft["event"], value: string) => setDraft((current) => ({ ...current, event: { ...current.event, [field]: value } }));
  const toggleService = (service: ProjectService) => setDraft((current) => ({ ...current, services: current.services.includes(service) ? current.services.filter((item) => item !== service) : [...current.services, service] }));
  const canContinue = step === 0 ? Boolean(draft.type) : step === 1 ? Boolean(draft.client.name && draft.client.email && draft.client.phone) : step === 2 ? Boolean(draft.event.date && draft.event.time && draft.event.location && draft.event.city) : step === 3 ? draft.services.length > 0 : true;
  const createProject = () => {
    if (!draft.type) return;
    const project: Project = { id: `mock-${Date.now()}`, name: `${draft.client.name} · ${draft.type}`, type: draft.type, client: draft.client, event: draft.event, services: draft.services, status: "Upcoming", health: "Healthy" };
    onCreate(project);
    resetAndClose();
  };

  return <><button aria-label="Close new project drawer" className="fixed inset-0 z-40 cursor-default bg-black/30 backdrop-blur-[1px]" onClick={resetAndClose} type="button" /><aside aria-label="New project" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-card shadow-2xl"><header className="flex items-start justify-between border-b p-5 sm:p-6"><div><p className="text-xs font-medium uppercase tracking-wider text-muted">Step {step + 1} of {steps.length}</p><h2 className="mt-1 text-xl font-semibold">{steps[step]}</h2></div><Button aria-label="Close drawer" onClick={resetAndClose} size="icon" variant="ghost"><X aria-hidden="true" className="size-4" /></Button></header><div className="flex gap-1 border-b px-5 py-3 sm:px-6">{steps.map((label, index) => <span aria-label={`${label}: ${index < step ? "complete" : index === step ? "current" : "upcoming"}`} className={cn("h-1.5 flex-1 rounded-full bg-accent", index <= step && "bg-foreground")} key={label} />)}</div><div className="flex-1 overflow-y-auto p-5 sm:p-6">{step === 0 && <ChoiceGrid onSelect={(type) => setDraft((current) => ({ ...current, type }))} options={projectTypes} selected={draft.type} />}{step === 1 && <div className="space-y-4"><Field autoComplete="name" label="Name" onChange={(event) => updateClient("name", event.target.value)} required value={draft.client.name} /><Field autoComplete="email" label="Email" onChange={(event) => updateClient("email", event.target.value)} required type="email" value={draft.client.email} /><Field autoComplete="tel" label="Phone" onChange={(event) => updateClient("phone", event.target.value)} required type="tel" value={draft.client.phone} /><Field autoComplete="organization" label="Company (optional)" onChange={(event) => updateClient("company", event.target.value)} value={draft.client.company ?? ""} /></div>}{step === 2 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Date" onChange={(event) => updateEvent("date", event.target.value)} required type="date" value={draft.event.date} /><Field label="Time" onChange={(event) => updateEvent("time", event.target.value)} required type="time" value={draft.event.time} /><Field label="Venue" onChange={(event) => updateEvent("location", event.target.value)} required value={draft.event.location} /><Field label="City" onChange={(event) => updateEvent("city", event.target.value)} required value={draft.event.city} /></div>}{step === 3 && <ChoiceGrid multiple onSelect={toggleService} options={projectServices} selected={draft.services} />}{step === 4 && <Summary draft={draft} />}</div><footer className="flex items-center justify-between gap-3 border-t p-5 sm:p-6"><ActionButton disabled={step === 0} icon={ChevronLeft} label="Back" onClick={() => setStep((current) => current - 1)} variant="outline" />{step < steps.length - 1 ? <ActionButton disabled={!canContinue} icon={ChevronRight} iconPosition="end" label="Continue" onClick={() => setStep((current) => current + 1)} /> : <ActionButton icon={Check} label="Create Project" onClick={createProject} />}</footer></aside></>;
}

function ChoiceGrid<T extends ProjectType | ProjectService>({ options, selected, onSelect, multiple }: { options: readonly T[]; selected?: T | T[]; onSelect: (value: T) => void; multiple?: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2">{options.map((option) => { const isSelected = Array.isArray(selected) ? selected.includes(option) : selected === option; return <button aria-pressed={isSelected} className={cn("flex min-h-20 items-center justify-between rounded-lg border bg-background p-4 text-left text-sm font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2", isSelected && "border-foreground bg-accent")} key={option} onClick={() => onSelect(option)} type="button"><span>{option}</span>{isSelected && <Check aria-hidden="true" className="size-4" />}{multiple && !isSelected && <span aria-hidden="true" className="size-4 rounded border" />}</button>; })}</div>;
}

function Summary({ draft }: { draft: ProjectDraft }) {
  const clientDetails = [draft.client.name, draft.client.email, draft.client.phone, draft.client.company].filter(Boolean).join(" · ");
  const sections = [{ label: "Event type", value: draft.type }, { label: "Client", value: clientDetails }, { label: "Event", value: `${draft.event.date} at ${draft.event.time}` }, { label: "Venue", value: `${draft.event.location}, ${draft.event.city}` }, { label: "Services", value: draft.services.join(" · ") }];
  return <dl className="divide-y rounded-lg border bg-background px-4">{sections.map(({ label, value }) => <div className="py-4" key={label}><dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 text-sm">{value || "Not provided"}</dd></div>)}</dl>;
}
