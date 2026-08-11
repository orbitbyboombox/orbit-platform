"use client";

import { type ComponentType, type ReactNode } from "react";
import { CreditCard, FileText, Mail, Phone, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCompanySettings } from "@/features/company-settings";
import { CustomerPaymentExperience } from "./customer-payment-experience";
import { CustomerEventExperience } from "./customer-event-experience";

type PortalData = Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>> & {};
type PortalProject = NonNullable<PortalData>["project"] & {
  customers: { full_name: string; email: string; phone: string; metadata?: Record<string, unknown> };
  project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }>;
  finance: Record<string, unknown>;
  operations: Record<string, unknown>;
};

function Panel({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return <section className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 sm:p-7" id={id}><h2 className="text-xl font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-muted">{description}</p>}<div className="mt-5">{children}</div></section>;
}

export function CustomerPortalHome({ data, token }: { data: NonNullable<PortalData>; token: string }) {
  const company = useCompanySettings();
  const project = data.project as PortalProject;
  const eventDate = project.event_date ? new Date(`${project.event_date}T12:00:00Z`) : null;
  const days = eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / 86_400_000) : null;
  const countdown = days == null ? "Fecha por confirmar" : days < 0 ? "Evento finalizado" : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
  const firstName = project.customers.full_name.trim().split(/\s+/)[0] || "Hola";
  const contractUrl = `/api/portal/${encodeURIComponent(token)}/contract`;
  const phone = company.phone || "+56 9 0000 0000";
  const whatsapp = phone.replace(/\D/g, "");

  const quickAccess: Array<{ icon: ComponentType<{ className?: string }>; label: string; href: string }> = [
    { icon: FileText, label: "Mi Contrato", href: contractUrl }, { icon: CreditCard, label: "Mis Pagos", href: "#payments" },
  ];

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
    <header className="overflow-hidden rounded-3xl border border-border/80 bg-card p-6 sm:p-9 lg:p-12">
      <BrandLogo className="h-16 w-48 sm:h-20 sm:w-60" priority surface="dark"/>
      <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">{company.portalKicker}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Hola {firstName} 👋</h1><p className="mt-3 text-lg font-medium">Toda la información esencial de tu evento.</p></div><div className="rounded-2xl border border-brand/20 bg-brand/5 p-5 text-center lg:min-w-56"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Faltan para tu evento</p><p className="mt-2 text-3xl font-semibold text-brand">{countdown}</p></div></div>
    </header>

    <Panel id="quick-access" title="Accesos rápidos"><nav aria-label="Accesos del Portal" className="grid grid-cols-2 gap-3">{quickAccess.map(({ icon: Icon, label, href }) => <a className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-background/40 p-3 text-center text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand" href={href} key={label}><Icon className="size-5"/>{label}</a>)}</nav></Panel>

    <CustomerEventExperience data={data}/>

    <CustomerPaymentExperience data={data} token={token}/>
    <Panel id="contact" title="Contacto BOOMBOX" description="Estamos disponibles si necesitas confirmar algún detalle de tu evento."><div className="grid gap-3 sm:grid-cols-3"><a className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/40 px-4 font-semibold hover:border-brand/50 hover:text-brand" href={`https://wa.me/${whatsapp}`} rel="noreferrer" target="_blank"><Phone className="size-4"/>WhatsApp BOOMBOX</a><a className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/40 px-4 font-semibold hover:border-brand/50 hover:text-brand" href={`tel:${phone}`}><Phone className="size-4"/>Llamar a BOOMBOX</a><a className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/40 px-4 font-semibold hover:border-brand/50 hover:text-brand" href={`mailto:${company.operationsEmail}`}><Mail className="size-4"/>Email BOOMBOX</a></div></Panel>
    <footer className="flex flex-col items-center gap-2 border-t border-border/70 py-8 text-center"><ShieldCheck className="size-5 text-brand"/><p className="text-sm font-semibold">Acceso privado y seguro</p><p className="text-xs text-muted">Este enlace vence el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(data.access.expires_at))}.</p></footer>
  </div></main>;
}
