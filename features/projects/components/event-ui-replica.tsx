"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Phone } from "lucide-react";

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
  invoice?: { invoiceNumber: string; outstandingBalance: number; status: string };
  equipment: string[];
};

const clp = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const display = (value: string, fallback = "Por confirmar") => value.trim() || fallback;
const phoneHref = (value: string) => `tel:${value.replace(/[^+\d]/g, "")}`;

export function EventUiReplica({ projectId, customer, date, service, serviceDuration, serviceStartTime, serviceEndTime, staffCallTime, venue, municipality, status, eventType, extras, operationalContactName, operationalContactPhone, invoice, equipment }: Props) {
  const normalizedExtras = extras.map((item) => item.trim()).filter(Boolean);
  const contactName = display(operationalContactName, "Contacto operacional pendiente");
  const contactPhone = display(operationalContactPhone, "Teléfono pendiente");
  const hasPhone = Boolean(operationalContactPhone.trim());
  const serviceLabel = `${display(service, "Servicio BOOMBOX")}${serviceDuration ? ` · ${serviceDuration} horas` : ""}`;
  const timeRange = serviceStartTime && serviceEndTime ? `${serviceStartTime} → ${serviceEndTime} hrs` : "Horario por confirmar";

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
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-4 lg:col-span-2"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Caja Negra</p><h2 className="mt-1 font-semibold">Equipamiento del evento</h2></div><ChevronRight className="size-5 text-white/40"/></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/70 sm:grid-cols-4">{["Caja Negra", "Impresora", "Cámara", "Pantalla", "Operador", "Montaje", "Desmontaje", ...equipment].filter((item, index, all) => item && all.indexOf(item) === index).map(item=><span className="rounded-xl border border-white/10 px-3 py-2" key={item}>{item}</span>)}</div></div>
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-4"><p className="text-xs uppercase tracking-[.16em] text-brand">Operación</p><h2 className="mt-1 font-semibold">Estado operativo</h2><div className="mt-4 grid grid-cols-2 gap-2 text-xs">{["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map(item=><span className="rounded-full border border-white/10 px-2 py-2 text-center text-white/65" key={item}>{item}</span>)}</div></div>
    </div>
    {invoice ? <div className="rounded-2xl border border-brand/25 bg-[#241812] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-brand">Cobranza · admin</p><h2 className="mt-1 font-semibold">Saldo pendiente {clp(invoice.outstandingBalance)}</h2><p className="mt-1 text-xs text-white/55">Factura {invoice.invoiceNumber} · {invoice.status}</p></div><Link className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-black" href={`/finance/receivables?project=${projectId}`}>COBRAR CLIENTE</Link></div></div> : null}
    <Link className="flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-black" href={`/projects/${projectId}?experience=operations`}>Abrir operación del evento</Link>
  </section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-white/45">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
