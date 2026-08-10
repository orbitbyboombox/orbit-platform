"use client";

import { useMemo, useState, useTransition } from "react";
import { Boxes, Building2, CalendarDays, Car, CircleDollarSign, FileText, Search, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { updateMasterDataAction } from "./actions";
import type { MasterDataDomain, MasterDataProjection, MasterDataRecord } from "./types";
import { ServicesPricingCenter } from "./services-pricing-center";
import { EventVenueCenter } from "./event-venue-center";

const SECTIONS: readonly { id: MasterDataDomain; label: string; description: string; icon: typeof Settings2 }[] = [
  { id: "SERVICES", label: "Servicios", description: "Catálogo, orden, disponibilidad y presentación comercial.", icon: Sparkles },
  { id: "EVENT_VENUES", label: "Sedes", description: "Lugares de eventos, ubicación y recargos especiales.", icon: Building2 },
  { id: "OFFICIAL_PRICING", label: "Precios oficiales", description: "Tarifas oficiales por servicio y duración. Los precios negociados no se modifican aquí.", icon: CircleDollarSign },
  { id: "EVENT_TYPES", label: "Tipos de evento", description: "Categorías comerciales disponibles en ORBIT.", icon: CalendarDays },
  { id: "EXTRAS", label: "Extras", description: "Complementos comerciales, precio y disponibilidad.", icon: Boxes },
  { id: "TRANSPORT", label: "Transporte", description: "Cobertura territorial y tarifas automáticas por destino.", icon: Car },
  { id: "STAFF", label: "Staff", description: "Importación, estado, capacidades, especializaciones y clasificación.", icon: Users },
  { id: "EQUIPMENT", label: "Equipamiento", description: "Tótems, cases, vehículos, mantenimiento y disponibilidad.", icon: Boxes },
  { id: "PAYROLL", label: "Payroll", description: "Pagos operacionales, bonos y reglas de estacionamiento.", icon: CircleDollarSign },
  { id: "COMPANY", label: "Empresa", description: "IVA, información legal, branding y pies documentales.", icon: Building2 },
  { id: "DOCUMENT_TEMPLATES", label: "Plantillas", description: "Cotizaciones, acuerdos y comunicaciones oficiales.", icon: FileText },
  { id: "GOOGLE_WORKSPACE", label: "Google Workspace", description: "Estado, servicios concedidos, token y sincronización.", icon: ShieldCheck },
  { id: "SYSTEM_PARAMETERS", label: "Sistema", description: "Moneda, idioma, zona horaria y formatos regionales.", icon: Settings2 },
];

function Editor({ canEdit, record }: { canEdit: boolean; record: MasterDataRecord }) {
  const [enabled, setEnabled] = useState(record.enabled);
  const [order, setOrder] = useState(record.displayOrder);
  const [price, setPrice] = useState(record.price == null ? "" : String(record.price));
  const [configuration, setConfiguration] = useState(record.configuration ?? "{}");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const commercial = ["OFFICIAL_PRICING", "EXTRAS", "TRANSPORT"].includes(record.domain);
  return (
    <article className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-semibold">{record.label}</p><p className="mt-1 text-xs text-muted">{record.code} · v{record.version}</p></div>
        <StatusBadge label={enabled ? "Activo" : "Inactivo"} variant={enabled ? "success" : "neutral"} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{record.description ?? record.detail}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">Orden<input className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={!canEdit} min="0" onChange={(event) => setOrder(Number(event.target.value))} type="number" value={order} /></label>
        {commercial ? <label className="text-xs font-semibold text-muted">Precio oficial<input className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={!canEdit} min="0" onChange={(event) => setPrice(event.target.value)} placeholder="Por definir" type="number" value={price} /></label> : <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-border px-3 text-sm"><input checked={enabled} disabled={!canEdit} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /> Disponible</label>}
      </div>
      {commercial && <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm"><input checked={enabled} disabled={!canEdit} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /> Disponible</label>}
      {!commercial && <label className="mt-3 block text-xs font-semibold text-muted">Configuración<textarea className="mt-1 min-h-28 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground" disabled={!canEdit} onChange={(event) => setConfiguration(event.target.value)} value={configuration} /></label>}
      {canEdit && <><label className="mt-3 block text-xs font-semibold text-muted">Razón del cambio<input className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" onChange={(event) => setReason(event.target.value)} placeholder="Obligatoria para auditoría" value={reason} /></label><div className="mt-3 flex items-center gap-3"><ActionButton disabled={pending || !reason.trim()} label={pending ? "Guardando…" : "Guardar cambio"} onClick={() => startTransition(async () => { const result = await updateMasterDataAction({ id: record.id, source: commercial ? "COMMERCIAL" : "MASTER", enabled, displayOrder: order, price: commercial ? (price === "" ? null : Number(price)) : undefined, configuration: commercial ? undefined : configuration, reason, expectedVersion: record.version }); setMessage(result.ok ? "Cambio guardado y auditado." : result.error); })} type="button" /><span className="text-xs text-muted" role="status">{message}</span></div></>}
    </article>
  );
}

export function MasterDataCenter({ canEdit, equipmentCount, records, role, services, staffCount, venues }: MasterDataProjection) {
  const [active, setActive] = useState<MasterDataDomain>("SERVICES");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => records.filter((record) => record.domain === active && `${record.label} ${record.code} ${record.detail}`.toLowerCase().includes(query.toLowerCase())), [active, query, records]);
  const section = SECTIONS.find((item) => item.id === active) ?? SECTIONS[0];
  return <section className="space-y-7" id="master-data">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Configuración · Master Data</p><SectionTitle description="Administra los parámetros comerciales y operacionales desde una única fuente persistente y auditable." title="Centro de Datos Maestros" /></div>
    <div className="flex flex-wrap items-center gap-2"><StatusBadge label={canEdit ? "Edición habilitada" : "Solo lectura"} variant={canEdit ? "success" : "info"} /><span className="text-xs text-muted">Rol actual: {role}</span></div>
    <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Categorías de datos maestros" className="grid gap-2 sm:grid-cols-2 xl:block xl:space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => <button className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${active === id ? "bg-foreground text-background" : "text-muted hover:bg-accent hover:text-foreground"}`} key={id} onClick={() => { setActive(id); setQuery(""); }} type="button"><Icon aria-hidden="true" className="size-4" />{label}</button>)}
      </nav>
      <div className="min-w-0 space-y-5">
        <div className="rounded-2xl border border-border/80 bg-card p-5"><h2 className="text-xl font-semibold tracking-tight">{section.label}</h2><p className="mt-1 text-sm text-muted">{section.description}</p></div>
        {active === "SERVICES" ? <ServicesPricingCenter canEdit={canEdit} initialServices={services}/> : active === "EVENT_VENUES" ? <EventVenueCenter canEdit={canEdit} projection={venues}/> : active === "STAFF" ? <div className="rounded-2xl border border-border/80 bg-card p-5"><p className="text-3xl font-semibold">{staffCount}</p><p className="mt-1 text-sm text-muted">integrantes registrados en producción</p><a className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background" href="/resources/staff">Abrir gestión de Staff</a></div> : active === "EQUIPMENT" ? <div className="rounded-2xl border border-border/80 bg-card p-5"><p className="text-3xl font-semibold">{equipmentCount}</p><p className="mt-1 text-sm text-muted">activos operacionales registrados</p><a className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background" href="/resources">Abrir equipamiento</a></div> : active === "GOOGLE_WORKSPACE" ? <div className="rounded-2xl border border-border/80 bg-card p-5"><p className="font-semibold">La conexión se administra en el Centro de Conexiones.</p><p className="mt-2 text-sm text-muted">Allí puedes revisar Calendar, Drive, Gmail, vigencia del token y última verificación.</p><a className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background" href="#connections">Ver Google Workspace</a></div> : <><label className="relative block"><Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-muted" /><input className="min-h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground" onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar en ${section.label.toLowerCase()}…`} value={query} /></label><div className="grid gap-4 lg:grid-cols-2">{filtered.map((record) => <Editor canEdit={canEdit} key={record.id} record={record} />)}</div>{filtered.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="font-semibold">No hay parámetros que coincidan.</p><p className="mt-1 text-sm text-muted">Prueba otra búsqueda o revisa una categoría diferente.</p></div>}</>}
      </div>
    </div>
  </section>;
}
