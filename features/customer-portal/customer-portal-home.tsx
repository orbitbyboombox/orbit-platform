"use client";

import { useState, useTransition, type ComponentType, type ReactNode } from "react";
import { CheckCircle2, Clock3, CreditCard, Download, FileText, FolderOpen, Images, MapPin, MessageCircle, Palette, Send, ShieldCheck, Upload } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCompanySettings } from "@/features/company-settings";
import { submitPortalRequestAction } from "./actions";

type PortalData = Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>> & {};
type PortalProject = NonNullable<PortalData>["project"] & {
  customers: { full_name: string; email: string; phone: string; metadata?: Record<string, unknown> };
  project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }>;
  finance: Record<string, unknown>;
  operations: Record<string, unknown>;
};

const money = (value: number | string | null | undefined) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
const projectStatusLabel: Record<string, string> = { DRAFT: "En preparación", QUOTATION_ACCEPTED: "Cotización aprobada", RESERVED: "Reserva confirmada", CONFIRMED: "Evento confirmado", COMPLETED: "Evento finalizado", ARCHIVED: "Entregado" };

function Panel({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return <section className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 sm:p-7" id={id}><h2 className="text-xl font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-muted">{description}</p>}<div className="mt-5">{children}</div></section>;
}

function State({ label, ready }: { label: string; ready: boolean }) {
  return <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border/70 px-3"><span className="text-sm font-medium">{label}</span><StatusBadge label={ready ? "Listo" : "En proceso"} variant={ready ? "success" : "warning"}/></div>;
}

export function CustomerPortalHome({ data, token }: { data: NonNullable<PortalData>; token: string }) {
  const company = useCompanySettings();
  const project = data.project as PortalProject;
  const eventDate = project.event_date ? new Date(`${project.event_date}T12:00:00Z`) : null;
  const days = eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / 86_400_000) : null;
  const countdown = days == null ? "Fecha por confirmar" : days < 0 ? "Evento finalizado" : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
  const [type, setType] = useState<"MESSAGE" | "QUESTION" | "ADDITIONAL_SERVICE" | "DESIGN_COMMENT">("MESSAGE");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const agreementSigned = data.agreement?.status === "SIGNED";
  const paymentStatus = String(project.finance?.status ?? project.finance?.paymentStatus ?? "PENDING");
  const paymentReady = ["PAID", "APPROVED", "CONFIRMED"].includes(paymentStatus);
  const firstName = project.customers.full_name.trim().split(/\s+/)[0] || "Hola";
  const notes = String(project.operations?.notes ?? "");
  const note = (label: string) => notes.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"))?.[1]?.trim();
  const eventAddress = note("Dirección evento") ?? String(project.customers.metadata?.address ?? project.city ?? "Por confirmar");
  const operationalContact = note("Contacto operacional") ?? project.customers.phone ?? "Equipo BOOMBOX";
  const services = project.project_services ?? [];
  const serviceSummary = services.map((item) => item.service_code).join(" + ") || project.project_type || "Por confirmar";
  const hoursSummary = services.map((item) => item.duration_hours ? `${item.duration_hours} horas` : null).filter(Boolean).join(" · ") || "Por confirmar";
  const designReady = data.uploads.length > 0;
  const operationsReady = String(project.operations?.status ?? "") === "READY";
  const reservationReady = ["CONFIRMED", "RESERVED", "COMPLETED"].includes(project.status);
  const nextStep = !designReady
    ? { title: "Sube tu diseño", detail: "Comparte logos, imágenes o referencias para que nuestro equipo pueda comenzar.", href: "#design" }
    : !paymentReady
      ? { title: "Completa el pago", detail: "Revisa el estado de tu reserva y el saldo pendiente.", href: "#payments" }
      : !operationsReady
        ? { title: "Estamos preparando tu evento", detail: "BOOMBOX está coordinando los detalles operacionales. No necesitas realizar ninguna acción.", href: "#event-summary" }
        : { title: "No tienes acciones pendientes", detail: "Todo avanza correctamente. Te avisaremos si necesitamos algo más.", href: "#event-status" };
  const submit = () => startTransition(async () => { const result = await submitPortalRequestAction({ token, type, message }); setFeedback(result.ok ? result.message : result.error); if (result.ok) setMessage(""); });

  const quickAccess: Array<{ icon: ComponentType<{ className?: string }>; label: string; href: string }> = [
    { icon: FileText, label: "Contrato", href: "#contract" }, { icon: CreditCard, label: "Pagos", href: "#payments" },
    { icon: Palette, label: "Diseños", href: "#design" }, { icon: FolderOpen, label: "Documentos", href: "#documents" },
    { icon: Images, label: "Galería", href: "#gallery" }, { icon: MessageCircle, label: "Mensajes", href: "#messages" },
  ];

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
    <header className="overflow-hidden rounded-3xl border border-border/80 bg-card p-6 sm:p-9 lg:p-12">
      <BrandLogo className="h-16 w-48 sm:h-20 sm:w-60" priority surface="dark"/>
      <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">{company.portalKicker}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Hola {firstName} 👋</h1><p className="mt-3 text-lg font-medium">Bienvenido a tu Portal BOOMBOX.</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Thank you for trusting us to be part of your event.</p></div><div className="rounded-2xl border border-brand/20 bg-brand/5 p-5 text-center lg:min-w-56"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Faltan para tu evento</p><p className="mt-2 text-3xl font-semibold text-brand">{countdown}</p></div></div>
      <div className="mt-9 grid gap-4 border-t border-border/70 pt-7 sm:grid-cols-3"><SummaryItem label="Evento" value={project.name}/><SummaryItem label="Fecha" value={eventDate ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(eventDate) : "Por confirmar"}/><SummaryItem label="Estado" value={projectStatusLabel[project.status] ?? "En preparación"}/></div>
    </header>

    <Panel id="next-step" title="Tu próximo paso"><a className="group flex items-center justify-between gap-4 rounded-2xl border border-brand/25 bg-brand/5 p-4 transition-colors hover:border-brand/60 sm:p-5" href={nextStep.href}><div><p className="font-semibold">{nextStep.title}</p><p className="mt-1 text-sm leading-6 text-muted">{nextStep.detail}</p></div><span aria-hidden="true" className="text-xl text-brand transition-transform group-hover:translate-x-1">→</span></a></Panel>
    <Panel id="quick-access" title="Accesos rápidos"><nav aria-label="Accesos del Portal" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{quickAccess.map(({ icon: Icon, label, href }) => <a className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-background/40 p-3 text-center text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand" href={href} key={label}><Icon className="size-5"/>{label}</a>)}</nav></Panel>

    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]"><div className="min-w-0 space-y-6">
      <Panel id="event-status" title="Estado de tu evento" description={`Actualizamos cada paso a medida que ${company.brandName} confirma el avance.`}><div className="grid gap-3 sm:grid-cols-2"><State label="Reserva confirmada" ready={reservationReady}/><State label="Contrato firmado" ready={agreementSigned}/><State label="Estado del pago" ready={paymentReady}/><State label="Estado del diseño" ready={designReady}/><State label="Estado operacional" ready={operationsReady}/></div></Panel>
      <Panel id="event-summary" title="Resumen de tu evento"><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2"><Detail label="Fecha" value={eventDate ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(eventDate) : "Por confirmar"}/><Detail label="Servicio" value={serviceSummary}/><Detail label="Horas" value={hoursSummary}/><Detail label="Venue" value={project.location || "Por confirmar"}/><Detail label="Dirección" value={eventAddress}/><Detail label="Contacto operacional" value={operationalContact}/></dl></Panel>
      <Panel id="design" title="Centro de diseño" description="Comparte logos, imágenes, instrucciones y comentarios con nuestro equipo."><form action={`/api/portal/${encodeURIComponent(token)}/upload`} className="grid min-w-0 gap-3" encType="multipart/form-data" method="post"><input accept="image/*,.pdf,.ai,.eps,.svg" className="min-h-12 min-w-0 max-w-full overflow-hidden rounded-xl border border-dashed border-border bg-background p-3 text-sm" name="file" required type="file"/><textarea className="min-h-24 min-w-0 max-w-full rounded-xl border border-border bg-background p-3 text-sm" name="instructions" placeholder="Instrucciones o comentarios para el diseño"/><ActionButton className="min-w-0 max-w-full" icon={Upload} label="Subir al Centro de Diseño" type="submit"/></form>{data.uploads.length > 0 && <ul className="mt-4 space-y-2">{data.uploads.map((file) => <li className="text-sm text-muted" key={file.id}>✓ {file.file_name}</li>)}</ul>}</Panel>
      <Panel id="event-information" title="Información del evento"><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border p-4"><MapPin className="size-5 text-brand"/><p className="mt-3 text-xs text-muted">Lugar</p><p className="mt-1 font-semibold">{project.location || "Por confirmar"}</p><p className="text-sm text-muted">{eventAddress}</p></div><div className="rounded-xl border p-4"><Clock3 className="size-5 text-brand"/><p className="mt-3 text-xs text-muted">Horario</p><p className="mt-1 font-semibold">{project.event_time?.slice(0, 5) || "Por confirmar"}</p></div></div></Panel>
    </div><aside className="min-w-0 space-y-6">
      <Panel id="payments" title="Pagos"><div className="grid gap-3"><div className="rounded-xl border p-4"><CreditCard className="size-5 text-brand"/><p className="mt-3 text-xs text-muted">Total acordado</p><p className="mt-1 text-2xl font-semibold">{money(data.quotation?.final_customer_price ?? data.quotation?.grand_total)}</p></div><State label="Pago de reserva" ready={paymentReady}/><State label="Saldo pendiente" ready={paymentStatus === "PAID"}/><p className="text-xs text-muted">Vencimiento: {data.quotation?.expiration_date ?? "Por confirmar"}</p></div></Panel>
      <Panel id="documents" title="Documentos"><div className="space-y-2">{data.quotation && <DocumentRow label={`Cotización ${data.quotation.quotation_number}`} ready={Boolean(data.quotation.drive_file_id)}/>}<div id="contract"><DocumentRow label="Contrato" ready={Boolean(data.agreement)}/></div><DocumentRow label="Contrato firmado" ready={agreementSigned}/>{data.documents.map((document) => <DocumentRow key={document.id} label={document.document_type} ready={Boolean(document.drive_file_id)}/>)}</div></Panel>
      <Panel id="messages" title="Mensajes" description="Tus mensajes quedan registrados en el historial del evento."><select className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" onChange={(event) => setType(event.target.value as typeof type)} value={type}><option value="MESSAGE">Mensaje</option><option value="QUESTION">Pregunta</option><option value="ADDITIONAL_SERVICE">Servicio adicional</option><option value="DESIGN_COMMENT">Comentario de diseño</option></select><textarea className="mt-3 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" onChange={(event) => setMessage(event.target.value)} placeholder="¿Cómo podemos ayudarte?" value={message}/><ActionButton className="mt-3 w-full" disabled={pending || !message.trim()} icon={Send} label={pending ? "Enviando…" : `Enviar a ${company.brandName}`} onClick={submit} type="button"/><p className="mt-3 text-xs text-muted" role="status">{feedback}</p></Panel>
      <Panel id="gallery" title="Galería"><div className="space-y-3">{project.status === "COMPLETED" ? <><ActionButton className="w-full" icon={Images} label="Abrir galería"/><ActionButton className="w-full" icon={Download} label="Descargar fotografías" variant="outline"/></> : <p className="text-sm leading-6 text-muted">Tu galería aparecerá aquí después del evento.</p>}</div></Panel>
    </aside></div>
    <footer className="flex flex-col items-center gap-2 border-t border-border/70 py-8 text-center"><ShieldCheck className="size-5 text-brand"/><p className="text-sm font-semibold">Acceso privado y seguro</p><p className="text-xs text-muted">Este enlace vence el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(data.access.expires_at))}.</p></footer>
  </div></main>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border/70 p-4"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function DocumentRow({ label, ready }: { label: string; ready: boolean }) { return <div className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 px-3"><FileText className="size-4 text-brand"/><span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>{ready ? <CheckCircle2 className="size-4 text-success"/> : <StatusBadge label="En preparación" variant="warning"/>}</div>; }
