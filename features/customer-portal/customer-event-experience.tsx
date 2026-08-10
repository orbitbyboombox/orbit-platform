"use client";

import { CalendarDays, CheckCircle2, Clock3, Mail, MapPin, Navigation, Phone, Sparkles, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCompanySettings } from "@/features/company-settings";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Project = PortalData["project"] & { operations: Record<string, unknown>; finance: Record<string, unknown>; project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }> };

const eventStatus: Record<string, string> = { DRAFT: "En preparación", RESERVED: "Reserva confirmada", CONFIRMED: "Confirmado", COMPLETED: "Evento finalizado", ARCHIVED: "Entregado" };
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Por confirmar";

export function CustomerEventExperience({ data }: { data: PortalData }) {
  const company = useCompanySettings();
  const project = data.project as Project;
  const eventDate = project.event_date ? new Date(`${project.event_date}T12:00:00Z`) : null;
  const days = eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / 86_400_000) : null;
  const countdown = days == null ? "Fecha por confirmar" : days < 0 ? "Evento realizado" : days === 0 ? "Hoy es el día" : days === 1 ? "Falta 1 día" : `Faltan ${days} días`;
  const services = project.project_services ?? [];
  const extras = services.flatMap((item) => normalizeExtras(item.extras));
  const paymentStatus = data.invoice?.status ?? String(project.finance.paymentStatus ?? project.finance.status ?? "PENDING");
  const paymentReady = paymentStatus === "PAID";
  const paymentPartial = ["PARTIALLY_PAID", "RESERVATION_RECEIVED", "APPROVED"].includes(paymentStatus);
  const designStatus = String(project.operations.designStatus ?? (data.uploads.length ? "PENDING_APPROVAL" : "PENDING"));
  const designApproved = designStatus === "APPROVED";
  const agreementSigned = data.agreement?.status === "SIGNED";
  const reservationConfirmed = ["RESERVED", "CONFIRMED", "COMPLETED", "ARCHIVED"].includes(project.status);
  const address = String(project.operations.eventAddress ?? project.city ?? "Por confirmar");
  const municipality = project.city || "Por confirmar";
  const contact = String(project.operations.operationalContact ?? "Equipo BOOMBOX");
  const phone = String(project.operations.operationalPhone ?? company.phone ?? "Por confirmar");
  const mapsQuery = [project.location, address, municipality, "Chile"].filter(Boolean).join(", ");
  const nextStep = !paymentReady && !paymentPartial
    ? { title: "Sube tu comprobante de pago", detail: "Adjunta el respaldo para que BOOMBOX pueda validarlo.", href: "#payments" }
    : designStatus === "PENDING_APPROVAL"
      ? { title: "Aprueba tu diseño", detail: "Revisa con nuestro equipo el material preparado para tu evento.", href: "#design" }
      : !data.uploads.length
        ? { title: "Sube tu diseño", detail: "Comparte logos, imágenes o referencias para comenzar.", href: "#design" }
        : { title: "Todo está listo", detail: "No tienes acciones pendientes. BOOMBOX está preparando tu evento.", href: "#event-status" };

  return <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" id="event-summary">
    <header className="border-b border-border/70 p-5 sm:p-7 lg:p-9"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Mi evento</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h2><p className="mt-2 text-sm text-muted">Toda la información importante de tu experiencia BOOMBOX.</p></div><div className="rounded-2xl border border-brand/20 bg-brand/5 px-6 py-5 text-center lg:min-w-60"><CalendarDays className="mx-auto size-5 text-brand"/><p className="mt-2 text-xs uppercase tracking-wide text-muted">Cuenta regresiva</p><p className="mt-1 text-2xl font-semibold text-brand">{countdown}</p></div></div></header>

    <div className="space-y-6 p-5 sm:p-7 lg:p-9">
      <a className="group flex items-center justify-between gap-4 rounded-2xl border border-brand/25 bg-brand/5 p-4 transition-colors hover:border-brand/60 sm:p-5" href={nextStep.href}><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Tu próximo paso</p><p className="mt-1 font-semibold">{nextStep.title}</p><p className="mt-1 text-sm leading-6 text-muted">{nextStep.detail}</p></div><span aria-hidden="true" className="text-xl text-brand transition-transform group-hover:translate-x-1">→</span></a>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" id="event-status"><Status label="Reserva" value={reservationConfirmed ? "Confirmada" : "Pendiente"} ready={reservationConfirmed}/><Status label="Contrato" value={agreementSigned ? "Firmado" : "Pendiente"} ready={agreementSigned}/><Status label="Pago" value={paymentReady ? "Pagado" : paymentPartial ? "Pago parcial" : "Pendiente"} ready={paymentReady}/><Status label="Diseño" value={designApproved ? "Aprobado" : "Pendiente"} ready={designApproved}/></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)]">
        <div className="space-y-6"><Card title="Información del evento"><dl className="grid gap-3 sm:grid-cols-2"><Detail icon={CalendarDays} label="Fecha" value={formatDate(project.event_date)}/><Detail icon={Clock3} label="Hora de llegada" value={time(project.operations.arrivalTime)}/><Detail icon={Sparkles} label="Inicio del servicio BOOMBOX" value={time(project.event_time)}/><Detail icon={MapPin} label="Venue" value={project.location || "Por confirmar"}/><Detail icon={Navigation} label="Dirección" value={address}/><Detail icon={MapPin} label="Comuna" value={municipality}/></dl><a className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:border-brand/60 hover:text-brand" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`} rel="noreferrer" target="_blank"><Navigation className="size-4"/>Abrir en Google Maps</a></Card>
          <Card title="Servicio contratado"><dl className="grid gap-3 sm:grid-cols-3"><Detail icon={Sparkles} label="Servicio" value={services.map((item) => item.service_code).join(" + ") || "Por confirmar"}/><Detail icon={Clock3} label="Horas" value={services.map((item) => item.duration_hours ? `${item.duration_hours} horas` : null).filter(Boolean).join(" · ") || "Por confirmar"}/><Detail icon={CheckCircle2} label="Extras" value={extras.join(" · ") || "Sin extras"}/></dl></Card></div>
        <aside><Card title="Tu contacto BOOMBOX"><div className="space-y-3"><Contact icon={UserRound} label="Contacto operacional" value={contact}/><Contact icon={Phone} label="Teléfono" value={phone}/><Contact icon={Mail} label="Correo" value={company.operationsEmail}/></div><p className="mt-4 border-t border-border/70 pt-4 text-xs leading-5 text-muted">Puedes contactarnos si necesitas confirmar un detalle operativo de tu evento.</p></Card><div className="mt-6 rounded-2xl border border-border/80 bg-background/30 p-5"><p className="text-xs text-muted">Estado actual del evento</p><p className="mt-2 text-lg font-semibold">{eventStatus[project.status] ?? "En preparación"}</p></div></aside>
      </div>
    </div>
  </section>;
}

function normalizeExtras(value: unknown): string[] { if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).name ?? "") : "").filter(Boolean); }
function time(value: unknown) { const text=String(value??""); return /^\d{2}:\d{2}/.test(text) ? text.slice(0,5) : "Por confirmar"; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-border/80 bg-background/30 p-4 sm:p-5"><h3 className="font-semibold">{title}</h3><div className="mt-4">{children}</div></section>; }
function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) { return <div className="rounded-xl border border-border/70 p-4"><Icon className="size-4 text-brand"/><dt className="mt-3 text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Status({ label, value, ready }: { label: string; value: string; ready: boolean }) { return <div className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-4"><div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div><StatusBadge label={ready ? "Listo" : "En proceso"} variant={ready ? "success" : "warning"}/></div>; }
function Contact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) { return <div className="flex items-start gap-3 rounded-xl border border-border/70 p-3"><Icon className="mt-0.5 size-4 text-brand"/><div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value || "Por confirmar"}</p></div></div>; }
