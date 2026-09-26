"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Phone } from "lucide-react";
import { useState, useTransition } from "react";
import { updateEventPaperVariantAction, type PaperVariant } from "@/features/projects/event-paper.actions";

type Props = {
  projectId: string;
  customer: string;
  date: string;
  service: string;
  serviceDuration: number | null;
  serviceStartTime: string;
  serviceEndTime: string;
  staffCallTime: string;
  venue: string;
  municipality: string;
  status: string;
  eventType: string;
  extras: string[];
  operationalContactName: string;
  operationalContactPhone: string;
  operators: Array<{ role: string; name: string; callTime: string }>;
  paper: {
    opening: number | null;
    final: number | null;
    usage: number | null;
    reloads: number;
    format: string | null;
    variant: PaperVariant | null;
    status: string | null;
  } | null;
  invoice?: { invoiceNumber: string; outstandingBalance: number; status: string };
  equipment: string[];
};

const clp = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const display = (value: string, fallback = "Por confirmar") => value.trim() || fallback;
const phoneHref = (value: string) => `tel:${value.replace(/[^+\d]/g, "")}`;
const timeToMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
const minutesToTime = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const formatTimeRange = (start: string, end: string, duration: number | null) => {
  if (!start) return "Horario por confirmar";
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const resolvedEnd = end || (startMinutes !== null && duration ? minutesToTime(startMinutes + duration * 60) : "");
  if (!resolvedEnd) return `${start} hrs`;
  if (startMinutes !== null && endMinutes !== null && startMinutes === endMinutes && duration) {
    return `${start} → ${minutesToTime(startMinutes + duration * 60)} hrs`;
  }
  return `${start} → ${resolvedEnd} hrs`;
};
const roleLabel = (role: string) => ({ OPERATOR: "OPERATOR", ASSEMBLY: "MONTAJE", DISASSEMBLY: "DESMONTAJE" }[role] ?? role);

export function EventUiReplica({ projectId, customer, date, service, serviceDuration, serviceStartTime, serviceEndTime, staffCallTime, venue, municipality, status, eventType, extras, operationalContactName, operationalContactPhone, operators, paper, invoice, equipment }: Props) {
  const [paperMessage, setPaperMessage] = useState("");
  const [paperPending, startPaperTransition] = useTransition();
  const normalizedExtras = extras.map((item) => item.trim()).filter(Boolean);
  const contactName = display(operationalContactName, "Contacto operacional pendiente");
  const contactPhone = display(operationalContactPhone, "Teléfono pendiente");
  const hasPhone = Boolean(operationalContactPhone.trim());
  const serviceLabel = `${display(service, "Servicio BOOMBOX")}${serviceDuration ? ` · ${serviceDuration} horas` : ""}`;
  const timeRange = formatTimeRange(serviceStartTime, serviceEndTime, serviceDuration);
  const equipmentItems = ["Caja Negra", "Impresora", "Cámara", "Pantalla", ...equipment].filter((item, index, all) => item && all.indexOf(item) === index);

  return <section className="mb-5 space-y-3 rounded-[24px] border border-white/10 bg-[#111214] p-3 text-white shadow-[0_20px_70px_rgba(0,0,0,.2)] sm:p-4">
    <div className="flex items-center justify-between gap-3 text-sm text-white/60"><Link href="/events" className="hover:text-brand">← Eventos</Link><span>Evento</span></div>
    <div className="rounded-2xl border border-brand/30 bg-[#191a1d] p-3 shadow-[0_0_35px_rgba(247,137,0,.08)] sm:p-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="grid size-[4.5rem] shrink-0 place-items-center rounded-xl bg-brand text-center text-black sm:size-20"><span className="text-[10px] uppercase tracking-[.16em]">{new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CL", { weekday: "short" })}</span><strong className="text-3xl leading-none">{date.slice(8, 10)}</strong><span className="text-[10px]">{date.slice(5, 7)}</span></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="text-xs text-white/55">{eventType}</p><span className="text-white/25">·</span><p className="text-xs font-semibold text-brand">{serviceLabel}</p></div><h1 className="mt-0.5 text-2xl font-semibold leading-tight sm:text-3xl">{customer}</h1><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-base font-semibold tracking-tight">{timeRange}</p><p className="text-xs text-white/65">Citación Staff: {staffCallTime ? `${staffCallTime} hrs` : "Por confirmar"}</p></div><span className="mt-1.5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">{status}</span></div>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-7"><ModuleHeading eyebrow="Evento" title="Lugar y contacto"/><div className="mt-2 grid gap-2 sm:grid-cols-2"><Info label="Lugar" value={display(venue)}/><Info label="Comuna" value={display(municipality)}/></div><div className="mt-2"><p className="text-[11px] uppercase tracking-[.16em] text-white/45">Extras</p><div className="mt-1.5 flex flex-wrap gap-1.5">{normalizedExtras.length ? normalizedExtras.map((item) => <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand" key={item}>{item}</span>) : <span className="text-xs text-white/60">SIN EXTRAS</span>}</div></div><div className="mt-2 rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[11px] uppercase tracking-[.16em] text-white/45">Encargado del evento</p><p className="mt-1 text-sm font-semibold">{contactName}</p><p className="text-xs text-white/65">{contactPhone}</p></div><div className="mt-2 flex flex-wrap gap-2"><a className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-3.5 text-xs font-semibold text-black" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, ${municipality}`)}`} rel="noreferrer" target="_blank"><MapPin className="size-3.5"/>VER UBICACIÓN</a>{hasPhone ? <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/40 px-3.5 text-xs font-semibold text-brand" href={phoneHref(operationalContactPhone)}><Phone className="size-3.5"/>CONTACTAR</a> : null}</div></div>
      <div className="rounded-2xl border border-brand/25 bg-[#241812] p-3 lg:col-span-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[.16em] text-brand">Papel / impresión</p><h2 className="mt-0.5 text-sm font-semibold">Resumen del evento</h2></div><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">{paper?.status ?? "PENDIENTE"}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><PaperMetric label="Papel ida" value={paper?.opening === null || paper?.opening === undefined ? "PENDIENTE" : String(paper.opening)}/><PaperMetric label="Papel final evento" value={paper?.final === null || paper?.final === undefined ? "PENDIENTE" : String(paper.final)}/><PaperMetric label="Tipo de papel" value={paper?.variant === "NORMAL_4X6" ? "4x6 NORMAL" : paper?.variant === "PRECUT_4X6" ? "4x6 PREPICADO" : "PENDIENTE"}/><PaperMetric label="Impresiones utilizadas" value={paper?.usage === null || paper?.usage === undefined ? "PENDIENTE" : String(paper.usage)}/></div><div className="mt-2"><p className="text-[10px] uppercase tracking-[.14em] text-white/45">Tipo de papel</p><div className="mt-1 flex flex-wrap gap-1.5">{([['NORMAL_4X6','4x6 NORMAL'],['PRECUT_4X6','4x6 PREPICADO']] as const).map(([variant,label]) => <button className={`min-h-8 rounded-lg border px-2.5 text-[11px] font-semibold transition ${paper?.variant === variant ? "border-brand bg-brand/15 text-brand" : "border-white/10 text-white/70 hover:border-brand/50"}`} disabled={paperPending || !paper || paper.status === "CONFIRMED" || paper.status === "OVERRIDDEN"} key={variant} onClick={() => startPaperTransition(async () => { try { await updateEventPaperVariantAction({ projectId, variant }); setPaperMessage("Tipo de papel guardado."); } catch (error) { setPaperMessage(error instanceof Error ? error.message : "No fue posible guardar el tipo de papel."); } })} type="button">{label}</button>)}</div>{paperMessage ? <p className="mt-1 text-[10px] text-white/60">{paperMessage}</p> : null}</div></div>
    </div>
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-7"><ModuleHeading eyebrow="Operación" title="Operadores del evento"/><div className="mt-2 grid gap-2 sm:grid-cols-3">{operators.map((operator) => <div className="rounded-xl border border-white/10 bg-white/[.02] px-2.5 py-2" key={operator.role}><p className="text-[10px] uppercase tracking-[.14em] text-white/45">{roleLabel(operator.role)}</p><p className="mt-1 truncate text-xs font-semibold">{operator.name || "Sin asignar"}</p><p className="mt-1 text-[11px] text-white/55">{operator.callTime ? `${operator.callTime} hrs` : "Sin citación"}</p></div>)}</div><div className="mt-2 grid grid-cols-4 gap-1 text-[10px]">{["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map((item) => <span className="rounded-full border border-white/10 px-1 py-1 text-center text-white/65" key={item}>{item}</span>)}</div></div>
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-5"><ModuleHeading eyebrow="Operación" title="Caja Negra / equipamiento"/><div className="mt-2 grid grid-cols-2 gap-2">{equipmentItems.map((item) => <div className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/70" key={item}>{item}</div>)}</div><Link className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand/40 px-2.5 text-[11px] font-semibold text-brand" href={`/projects/${projectId}?experience=operations`}>VER EQUIPAMIENTO <ChevronRight className="size-3.5"/></Link></div>
    </div>
    {invoice ? <div className="max-w-2xl rounded-2xl border border-brand/25 bg-[#241812] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><ModuleHeading eyebrow="Cobranza" title="Saldo pendiente"/><p className="mt-1 text-lg font-semibold">{clp(invoice.outstandingBalance)}</p><p className="mt-1 text-xs text-white/55">Factura {invoice.invoiceNumber} · {invoice.status}</p></div><Link className="inline-flex min-h-10 items-center rounded-xl bg-brand px-3.5 text-xs font-semibold text-black" href={`/finance/receivables?project=${projectId}`}>COBRAR CLIENTE</Link></div></div> : null}
    <Link className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-black" href={`/projects/${projectId}?experience=operations`}>Abrir operación del evento</Link>
  </section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[10px] text-white/45">{label}</p><p className="mt-0.5 truncate text-xs font-semibold">{value}</p></div>; }
function PaperMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[10px] uppercase tracking-[.1em] text-white/45">{label}</p><p className="mt-0.5 text-xs font-semibold text-white/90">{value}</p></div>; }
function ModuleHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <><p className="text-[11px] uppercase tracking-[.16em] text-brand">{eyebrow}</p><h2 className="mt-0.5 text-sm font-semibold uppercase">{title}</h2></>; }
