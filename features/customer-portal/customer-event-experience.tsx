"use client";

import { CalendarDays, Clock3, MapPin, Sparkles, UserRound } from "lucide-react";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Project = PortalData["project"] & { operations: Record<string, unknown>; project_services: Array<{ service_code: string; duration_hours: number | null }> };

const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Por confirmar";

export function CustomerEventExperience({ data }: { data: PortalData }) {
  const project = data.project as Project;
  const services = project.project_services ?? [];
  const address = String(project.operations.eventAddress ?? project.city ?? "Por confirmar");
  const contact = String(project.operations.operationalContact ?? "Equipo BOOMBOX");

  return <section className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 sm:p-7 lg:p-9" id="event-summary">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Resumen del evento</p>
    <h2 className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h2>
    <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Detail icon={CalendarDays} label="Fecha" value={formatDate(project.event_date)}/>
      <Detail icon={MapPin} label="Lugar del evento" value={project.location || "Por confirmar"}/>
      <Detail icon={MapPin} label="Dirección" value={address}/>
      <Detail icon={Sparkles} label="Servicio" value={services.map((item) => item.service_code).join(" + ") || "Por confirmar"}/>
      <Detail icon={Clock3} label="Horas" value={services.map((item) => item.duration_hours ? `${item.duration_hours} horas` : null).filter(Boolean).join(" · ") || "Por confirmar"}/>
      <Detail icon={UserRound} label="Contacto operacional" value={contact}/>
    </dl>
  </section>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) { return <div className="rounded-xl border border-border/70 bg-background/30 p-4"><Icon className="size-4 text-brand"/><dt className="mt-3 text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
