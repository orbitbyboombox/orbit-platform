"use client";

import { useState, useTransition, type ComponentType, type ReactNode } from "react";
import { CreditCard, FileText, FolderOpen, Images, MessageCircle, Palette, Send, ShieldCheck, Upload } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ActionButton } from "@/components/ui/action-button";
import { useCompanySettings } from "@/features/company-settings";
import { submitPortalRequestAction } from "./actions";
import { CustomerContractExperience } from "./customer-contract-experience";
import { CustomerPaymentExperience } from "./customer-payment-experience";
import { CustomerEventExperience } from "./customer-event-experience";
import { CustomerDesignExperience } from "./customer-design-experience";
import { CustomerGalleryExperience } from "./customer-gallery-experience";
import { CustomerDocumentsExperience } from "./customer-documents-experience";

type PortalData = Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>> & {};
type PortalProject = NonNullable<PortalData>["project"] & {
  customers: { full_name: string; email: string; phone: string; metadata?: Record<string, unknown> };
  project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }>;
  finance: Record<string, unknown>;
  operations: Record<string, unknown>;
};

const projectStatusLabel: Record<string, string> = { DRAFT: "En preparación", QUOTATION_ACCEPTED: "Cotización aprobada", RESERVED: "Reserva confirmada", CONFIRMED: "Evento confirmado", COMPLETED: "Evento finalizado", ARCHIVED: "Entregado" };

function Panel({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return <section className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 sm:p-7" id={id}><h2 className="text-xl font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-muted">{description}</p>}<div className="mt-5">{children}</div></section>;
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
  const firstName = project.customers.full_name.trim().split(/\s+/)[0] || "Hola";
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

    <Panel id="quick-access" title="Accesos rápidos"><nav aria-label="Accesos del Portal" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{quickAccess.map(({ icon: Icon, label, href }) => <a className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-background/40 p-3 text-center text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand" href={href} key={label}><Icon className="size-5"/>{label}</a>)}</nav></Panel>

    <CustomerEventExperience data={data}/>

    <CustomerContractExperience data={data} token={token}/>

    <CustomerPaymentExperience data={data} token={token}/>

    <CustomerDesignExperience data={data} token={token}/>

    <CustomerDocumentsExperience data={data} token={token}/>

    <CustomerGalleryExperience data={data} token={token}/>

    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]"><div className="min-w-0 space-y-6">
      <Panel id="design-files" title="Tus archivos para diseño" description="Comparte logos, imágenes, instrucciones y referencias con nuestro equipo."><form action={`/api/portal/${encodeURIComponent(token)}/upload`} className="grid min-w-0 gap-3" encType="multipart/form-data" method="post"><input accept="image/*,.pdf,.ai,.eps,.svg" className="min-h-12 min-w-0 max-w-full overflow-hidden rounded-xl border border-dashed border-border bg-background p-3 text-sm" name="file" required type="file"/><textarea className="min-h-24 min-w-0 max-w-full rounded-xl border border-border bg-background p-3 text-sm" name="instructions" placeholder="Instrucciones o comentarios para el diseño"/><ActionButton className="min-w-0 max-w-full" icon={Upload} label="Compartir archivo" type="submit"/></form>{data.uploads.length > 0 && <ul className="mt-4 space-y-2">{data.uploads.map((file) => <li className="text-sm text-muted" key={file.id}>✓ {file.file_name}</li>)}</ul>}</Panel>
    </div><aside className="min-w-0 space-y-6">
      <Panel id="messages" title="Mensajes" description="Tus mensajes quedan registrados en el historial del evento."><select className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" onChange={(event) => setType(event.target.value as typeof type)} value={type}><option value="MESSAGE">Mensaje</option><option value="QUESTION">Pregunta</option><option value="ADDITIONAL_SERVICE">Servicio adicional</option><option value="DESIGN_COMMENT">Comentario de diseño</option></select><textarea className="mt-3 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" onChange={(event) => setMessage(event.target.value)} placeholder="¿Cómo podemos ayudarte?" value={message}/><ActionButton className="mt-3 w-full" disabled={pending || !message.trim()} icon={Send} label={pending ? "Enviando…" : `Enviar a ${company.brandName}`} onClick={submit} type="button"/><p className="mt-3 text-xs text-muted" role="status">{feedback}</p></Panel>
    </aside></div>
    <footer className="flex flex-col items-center gap-2 border-t border-border/70 py-8 text-center"><ShieldCheck className="size-5 text-brand"/><p className="text-sm font-semibold">Acceso privado y seguro</p><p className="text-xs text-muted">Este enlace vence el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(data.access.expires_at))}.</p></footer>
  </div></main>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
