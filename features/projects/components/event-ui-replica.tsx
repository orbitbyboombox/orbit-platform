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

  return <section className="mb-7 space-y-4 rounded-[28px] border border-white/10 bg-[#111214] p-4 text-white shadow-[0_20px_70px_rgba(0,0,0,.2)] sm:p-6">
    <div className="flex items-center justify-between gap-3 text-sm text-white/60"><Link href="/events" className="hover:text-brand">← Eventos</Link><span>Evento</span></div>
    <div className="rounded-2xl border border-brand/30 bg-[#191a1d] p-4 shadow-[0_0_35px_rgba(247,137,0,.08)] sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="grid size-24 shrink-0 place-items-center rounded-2xl bg-brand text-center text-black"><span className="text-xs uppercase tracking-[.16em]">{new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CL", { weekday: "short" })}</span><strong className="text-4xl leading-none">{date.slice(8, 10)}</strong><span className="text-xs">{date.slice(5, 7)}</span></div>
        <div className="min-w-0 flex-1"><p className="text-sm text-white/55">{eventType}</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{customer}</h1><p className="mt-3 text-base font-semibold text-brand">{serviceLabel}</p><p className="mt-2 text-lg font-semibold tracking-tight">{timeRange}</p><p className="mt-1 text-sm text-white/65">Citación Staff: {staffCallTime ? `${staffCallTime} hrs` : "Por confirmar"}</p><span className="mt-3 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">{status}</span></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Lugar" value={display(venue)}/><Info label="Comuna" value={display(municipality)}/></div>
      <div className="mt-4"><p className="text-xs uppercase tracking-[.16em] text-white/45">Extras</p><div className="mt-2 flex flex-wrap gap-2">{normalizedExtras.length ? normalizedExtras.map((item) => <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand" key={item}>{item}</span>) : <span className="text-sm text-white/60">SIN EXTRAS</span>}</div></div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4"><p className="text-xs uppercase tracking-[.16em] text-white/45">Encargado del evento</p><p className="mt-2 font-semibold">{contactName}</p><p className="mt-1 text-sm text-white/65">{contactPhone}</p></div>
      <div className="mt-4 flex flex-wrap gap-2"><a className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-black" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, ${municipality}`)}`} rel="noreferrer" target="_blank"><MapPin className="size-4"/>VER UBICACIÓN</a>{hasPhone ? <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand/40 px-4 text-sm font-semibold text-brand" href={phoneHref(operationalContactPhone)}><Phone className="size-4"/>CONTACTAR</a> : null}</div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-4"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Operación</p><h2 className="mt-1 font-semibold">OPERADORES DEL EVENTO</h2></div><span className="text-xs text-white/45">Citación {staffCallTime ? `${staffCallTime} hrs` : "por confirmar"}</span></div><div className="mt-4 space-y-2">{operators.map((operator) => <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5" key={operator.role}><div><p className="text-[11px] uppercase tracking-[.14em] text-white/45">{roleLabel(operator.role)}</p><p className="mt-1 text-sm font-semibold">{operator.name || "Sin asignar"}</p></div><span className="text-right text-xs text-white/55">{operator.callTime ? `${operator.callTime} hrs` : "Sin citación"}</span></div>)}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs">{["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map((item) => <span className="rounded-full border border-white/10 px-2 py-2 text-center text-white/65" key={item}>{item}</span>)}</div></div>
      <div className="rounded-2xl border border-brand/25 bg-[#241812] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Papel / impresión</p><h2 className="mt-1 font-semibold">Resumen del evento</h2></div><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/55">{paper?.status ?? "PENDIENTE"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><PaperMetric label="Papel ida" value={paper?.opening === null || paper?.opening === undefined ? "PENDIENTE" : String(paper.opening)}/><PaperMetric label="Papel final evento" value={paper?.final === null || paper?.final === undefined ? "PENDIENTE" : String(paper.final)}/><PaperMetric label="Tipo de papel" value={paper?.variant === "NORMAL_4X6" ? "4x6 NORMAL" : paper?.variant === "PRECUT_4X6" ? "4x6 PREPICADO" : "PENDIENTE"}/><PaperMetric label="Impresiones utilizadas" value={paper?.usage === null || paper?.usage === undefined ? "PENDIENTE" : String(paper.usage)}/></div><div className="mt-4"><p className="text-xs uppercase tracking-[.14em] text-white/45">Seleccionar tipo de papel</p><div className="mt-2 flex flex-wrap gap-2">{([['NORMAL_4X6','4x6 NORMAL'],['PRECUT_4X6','4x6 PREPICADO']] as const).map(([variant,label]) => <button className={`min-h-10 rounded-xl border px-3 text-xs font-semibold transition ${paper?.variant === variant ? "border-brand bg-brand/15 text-brand" : "border-white/10 text-white/70 hover:border-brand/50"}`} disabled={paperPending || !paper || paper.status === "CONFIRMED" || paper.status === "OVERRIDDEN"} key={variant} onClick={() => startPaperTransition(async () => { try { await updateEventPaperVariantAction({ projectId, variant }); setPaperMessage("Tipo de papel guardado."); } catch (error) { setPaperMessage(error instanceof Error ? error.message : "No fue posible guardar el tipo de papel."); } })} type="button">{label}</button>)}</div>{paperMessage ? <p className="mt-2 text-xs text-white/60">{paperMessage}</p> : null}</div><p className="mt-3 text-xs text-white/50">Fórmula C.5: apertura + recargas − final. El tipo de papel es metadata histórica y no modifica format_key.</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#191a1d] p-4"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Caja Negra</p><p className="mt-1 text-sm text-white/70">{["Caja Negra", "Impresora", "Cámara", "Pantalla", ...equipment].filter((item, index, all) => item && all.indexOf(item) === index).join(" · ") || "Equipamiento pendiente"}</p></div><Link className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand" href={`/projects/${projectId}?experience=operations`}>VER EQUIPAMIENTO <ChevronRight className="size-4"/></Link></div>
    {invoice ? <div className="rounded-2xl border border-brand/25 bg-[#241812] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Cobranza · admin</p><h2 className="mt-1 font-semibold">Saldo pendiente {clp(invoice.outstandingBalance)}</h2><p className="mt-1 text-xs text-white/55">Factura {invoice.invoiceNumber} · {invoice.status}</p></div><Link className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-black" href={`/finance/receivables?project=${projectId}`}>COBRAR CLIENTE</Link></div></div> : null}
    <Link className="flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-black" href={`/projects/${projectId}?experience=operations`}>Abrir operación del evento</Link>
  </section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-white/45">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
function PaperMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 p-3"><p className="text-[11px] uppercase tracking-[.12em] text-white/45">{label}</p><p className="mt-1 font-semibold text-white/90">{value}</p></div>; }
