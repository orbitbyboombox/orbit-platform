"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export type StaffLogisticsEvent = {
  id: string;
  projectId: string;
  orbitEventId: string;
  date: string;
  time: string;
  customer: string;
  service: string;
  duration: number | null;
  location: string;
  commune: string;
  status: string;
  operator: string;
  staffCallAt: string;
  box: string;
  extras: string[];
  address: string;
};

const dayFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short" });
const longDayFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const dateOnly = (value: string) => new Date(`${value}T12:00:00`);
const dateLabel = (value: string) => dayFormatter.format(dateOnly(value)).replaceAll(".", "").toUpperCase();
const formatTime = (value: string) => value?.slice(11, 16) || value?.slice(0, 5) || "--:--";
const normalizeStatus = (value: string) => {
  const status = value.toUpperCase();
  if (status.includes("CANCEL") || status.includes("REJECT")) return "CANCELLED";
  if (status.includes("CONFIRM") || status.includes("ACTIVE") || status.includes("RESERV") || status.includes("COMPLET")) return "CONFIRMED";
  return "PENDING";
};

const statusView = {
  CONFIRMED: { label: "Confirmado", color: "text-emerald-400", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  PENDING: { label: "Por confirmar", color: "text-[#F78900]", dot: "bg-[#F78900]", bar: "bg-[#F78900]" },
  CANCELLED: { label: "Cancelado", color: "text-red-400", dot: "bg-red-400", bar: "bg-red-400" },
} as const;

const monday = (value: Date) => {
  const result = new Date(value);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(12, 0, 0, 0);
  return result;
};

const iso = (value: Date) => value.toISOString().slice(0, 10);
const weekDays = (anchor: Date) => Array.from({ length: 7 }, (_, index) => {
  const value = new Date(anchor);
  value.setDate(value.getDate() + index);
  return iso(value);
});

const selectClass = "min-h-10 rounded-xl border border-white/10 bg-[#111214] px-3 text-xs text-white/80 outline-none focus:border-brand";

export function StaffLogisticsView({ events }: { events: StaffLogisticsEvent[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [commune, setCommune] = useState("ALL");
  const [operator, setOperator] = useState("ALL");
  const [box, setBox] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => monday(events[0] ? dateOnly(events[0].date) : new Date()));
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const weekSet = useMemo(() => new Set(days), [days]);

  const values = useMemo(() => ({
    services: [...new Set(events.map((event) => event.service).filter(Boolean))].sort(),
    communes: [...new Set(events.map((event) => event.commune).filter(Boolean))].sort(),
    operators: [...new Set(events.map((event) => event.operator).filter(Boolean))].sort(),
    boxes: [...new Set(events.map((event) => event.box).filter(Boolean))].sort(),
  }), [events]);

  const visible = useMemo(() => events.filter((event) => {
    const normalized = normalizeStatus(event.status);
    const haystack = [event.customer, event.service, event.location, event.commune, event.operator, event.box, event.orbitEventId].join(" ").toLowerCase();
    return weekSet.has(event.date) &&
      (!search.trim() || haystack.includes(search.trim().toLowerCase())) &&
      (status === "ALL" || normalized === status) &&
      (service === "ALL" || event.service === service) &&
      (commune === "ALL" || event.commune === commune) &&
      (operator === "ALL" || event.operator === operator) &&
      (box === "ALL" || event.box === box);
  }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [box, commune, events, operator, search, service, status, weekSet]);

  const selected = visible.find((event) => event.id === selectedId) ?? null;
  const counts = useMemo(() => events.filter((event) => weekSet.has(event.date)).reduce((result, event) => {
    result.total += 1;
    result[normalizeStatus(event.status)] += 1;
    return result;
  }, { total: 0, CONFIRMED: 0, PENDING: 0, CANCELLED: 0 }), [events, weekSet]);

  const shiftWeek = (amount: number) => setAnchor((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount * 7);
    return next;
  });

  return (
    <section className="space-y-5" aria-labelledby="staff-logistics-title">
      <header className="rounded-2xl border border-white/10 bg-[#111214] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Logística</p>
            <h2 id="staff-logistics-title" className="mt-1 text-2xl font-semibold text-white">Vista semanal operativa</h2>
            <p className="mt-1 text-sm text-white/50">Eventos, Staff y Caja Negra en una sola lectura operacional.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-60 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <input aria-label="Buscar evento, cliente o lugar" className={`${selectClass} w-full pl-9`} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento, cliente o lugar…" value={search} />
            </label>
            <button aria-label="Semana anterior" className="grid size-10 place-items-center rounded-xl border border-white/10 text-white/70 hover:border-brand hover:text-brand" onClick={() => shiftWeek(-1)}><ChevronLeft className="size-4" /></button>
            <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/75"><CalendarDays className="size-4 text-brand" />{longDayFormatter.format(dateOnly(days[0]))} – {longDayFormatter.format(dateOnly(days[6]))}</div>
            <button aria-label="Semana siguiente" className="grid size-10 place-items-center rounded-xl border border-white/10 text-white/70 hover:border-brand hover:text-brand" onClick={() => shiftWeek(1)}><ChevronRight className="size-4" /></button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Eventos esta semana", counts.total, "text-blue-300"],
            ["Confirmados", counts.CONFIRMED, "text-emerald-400"],
            ["Por confirmar", counts.PENDING, "text-brand"],
            ["Cancelados", counts.CANCELLED, "text-red-400"],
          ].map(([label, value, color]) => <div className="rounded-xl border border-white/10 bg-[#17181a] px-3 py-2.5" key={String(label)}><p className={`text-xl font-semibold ${color}`}>{value}</p><p className="mt-0.5 text-[11px] text-white/50">{label}</p></div>)}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#111214] p-3">
        <select aria-label="Filtrar por estado" className={selectClass} onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="PENDING">Por confirmar</option><option value="CANCELLED">Cancelado</option></select>
        <select aria-label="Filtrar por servicio" className={selectClass} onChange={(event) => setService(event.target.value)} value={service}><option value="ALL">Todos los servicios</option>{values.services.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por comuna" className={selectClass} onChange={(event) => setCommune(event.target.value)} value={commune}><option value="ALL">Todas las comunas</option>{values.communes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por operador" className={selectClass} onChange={(event) => setOperator(event.target.value)} value={operator}><option value="ALL">Todos los operadores</option>{values.operators.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por Caja Negra" className={selectClass} onChange={(event) => setBox(event.target.value)} value={box}><option value="ALL">Todas las cajas</option>{values.boxes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        {(search || status !== "ALL" || service !== "ALL" || commune !== "ALL" || operator !== "ALL" || box !== "ALL") && <button className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand" onClick={() => { setSearch(""); setStatus("ALL"); setService("ALL"); setCommune("ALL"); setOperator("ALL"); setBox("ALL"); }}><X className="size-3.5" />Limpiar</button>}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-[#111214] lg:block">
        <div className="grid grid-cols-[76px_6px_105px_minmax(170px,1.2fr)_minmax(150px,1fr)_118px_128px_22px] gap-3 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-white/35"><span>Fecha</span><span /><span>Horario</span><span>Evento / cliente</span><span>Ubicación</span><span>Estado</span><span>Servicio</span><span /></div>
        {visible.length ? visible.map((event) => <LogisticsRow event={event} key={event.id} onSelect={() => setSelectedId(event.id)} selected={selectedId === event.id} />) : <EmptyState />}
      </div>

      <div className="space-y-2 lg:hidden">{visible.length ? visible.map((event) => <LogisticsMobileCard event={event} key={event.id} onSelect={() => setSelectedId(event.id)} selected={selectedId === event.id} />) : <EmptyState />}</div>
      {selected && <LogisticsDetail event={selected} onClose={() => setSelectedId(null)} />}
    </section>
  );
}

function LogisticsRow({ event, onSelect, selected }: { event: StaffLogisticsEvent; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  return <button className={`grid w-full grid-cols-[76px_6px_105px_minmax(170px,1.2fr)_minmax(150px,1fr)_118px_128px_22px] items-center gap-3 border-b border-white/10 px-4 py-3 text-left transition hover:bg-white/[.03] ${selected ? "bg-brand/5" : ""}`} onClick={onSelect}>
    <span className="text-xs font-semibold text-white"><strong className="block text-base">{dateLabel(event.date).split(" ")[1]}</strong><span className="text-[10px] text-white/45">{dateLabel(event.date).split(" ")[0]} · {dateLabel(event.date).split(" ")[2]}</span></span><span className={`h-12 w-1 rounded-full ${state.bar}`} /><span className="text-sm font-medium text-white/90">{formatTime(event.time)}<span className="block text-[11px] text-white/40">Citación {formatTime(event.staffCallAt)}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="block truncate text-xs text-white/45">{event.operator === "Sin asignar" ? "Operador sin asignar" : `Operador · ${event.operator}`} · {event.box === "Sin asignar" ? "Sin caja" : event.box}</span></span><span className="flex min-w-0 items-start gap-1.5 text-xs text-white/65"><MapPin className="mt-0.5 size-3.5 shrink-0 text-white/45" /><span className="truncate">{event.location}<span className="block text-white/35">{event.commune}</span></span></span><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state.color}`}><i className={`size-2 rounded-full ${state.dot}`} />{state.label}</span><span className="justify-self-start rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[11px] font-semibold text-white/75">{event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><ChevronRight className="size-4 text-brand" />
  </button>;
}

function LogisticsMobileCard({ event, onSelect, selected }: { event: StaffLogisticsEvent; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  return <button className={`grid w-full grid-cols-[54px_minmax(0,1fr)_18px] gap-3 rounded-2xl border border-white/10 bg-[#111214] p-3 text-left ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect}><span className={`border-r-4 pr-2 ${state.bar}`}><strong className="block text-base text-white">{dateLabel(event.date).split(" ")[1]}</strong><span className="text-[10px] font-semibold text-white/45">{dateLabel(event.date).split(" ")[0]}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="mt-0.5 block text-xs text-white/70">{formatTime(event.time)} · {event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><span className="mt-1 block truncate text-[11px] text-white/45">{event.location} · {event.commune}</span><span className="mt-1 block truncate text-[11px] text-white/45">Citación {formatTime(event.staffCallAt)} · {event.operator} · {event.box}</span><span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${state.color}`}><i className={`size-1.5 rounded-full ${state.dot}`} />{state.label}</span></span><ChevronRight className="mt-1 size-4 text-brand" /></button>;
}

function LogisticsDetail({ event, onClose }: { event: StaffLogisticsEvent; onClose: () => void }) {
  const state = statusView[normalizeStatus(event.status)];
  const locationHref = event.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}` : null;
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4 sm:p-5" aria-label="Detalle logístico del evento"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Detalle logístico del evento</p><h3 className="mt-1 text-xl font-semibold text-white">{event.customer}</h3><p className="mt-1 text-xs text-white/45">{event.orbitEventId} · {event.date} · {formatTime(event.time)}</p></div><button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 hover:border-brand hover:text-brand" onClick={onClose}><X className="size-4" />Cerrar</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Evento" value={`${event.service}${event.duration ? ` · ${event.duration} horas` : ""}`} /><DetailItem label="Staff" value={`${event.operator} · Citación ${formatTime(event.staffCallAt)}`} /><DetailItem label="Caja Negra / equipo" value={event.box} /><DetailItem label="Estado operativo" value={state.label} tone={state.color} /></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Logística / ruta</p><p className="mt-1 flex items-start gap-2 text-sm text-white/80"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{event.address || `${event.location} · ${event.commune}`}</p><p className="mt-2 text-xs text-white/45">Extras: {event.extras.length ? event.extras.join(" · ") : "Sin extras"}</p></div>{locationHref && <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground" href={locationHref} rel="noreferrer" target="_blank">Ver ubicación</a>}</div></section>;
}

function DetailItem({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) { return <div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/40">{label}</p><p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p></div>; }
function EmptyState() { return <div className="p-8 text-center text-sm text-white/45">No hay eventos que coincidan con la semana y filtros seleccionados.</div>; }
