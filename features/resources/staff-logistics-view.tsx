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
  endTime: string;
  customer: string;
  service: string;
  duration: number | null;
  location: string;
  commune: string;
  status: string;
  operator: string;
  staffCallAt: string;
  setupTime: string;
  setupStaff: string;
  teardownTime: string;
  teardownStaff: string;
  box: string;
  extras: string[];
  address: string;
};

export type LogisticsRouteType = "ASSEMBLY" | "DISASSEMBLY" | "FULL_DAY";
export type LogisticsRouteDraft = {
  date: string;
  type: LogisticsRouteType;
  status: "DRAFT" | "CONFIRMED";
  eventIds: string[];
};

const longDayFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const dateOnly = (value: string) => new Date(`${value}T12:00:00`);
const dateParts = (value: string) => {
  const parts = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short" }).formatToParts(dateOnly(value));
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value.replaceAll(".", "").toUpperCase() ?? "--",
    day: parts.find((part) => part.type === "day")?.value ?? "--",
    month: parts.find((part) => part.type === "month")?.value.replaceAll(".", "").toUpperCase() ?? "--",
  };
};
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
const clockMinutes = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
};
const routeTarget = (event: StaffLogisticsEvent, type: LogisticsRouteType) => type === "DISASSEMBLY" ? event.endTime : event.setupTime || event.staffCallAt || event.time;
export const buildLogisticsRouteDraft = (events: readonly StaffLogisticsEvent[], date: string, type: LogisticsRouteType) => events
  .filter((event) => event.date === date)
  .sort((a, b) => clockMinutes(routeTarget(a, type)) - clockMinutes(routeTarget(b, type)) || a.commune.localeCompare(b.commune) || a.customer.localeCompare(b.customer))
  .map((event) => event.id);
const routeWarnings = (events: readonly StaffLogisticsEvent[], eventIds: readonly string[], type: LogisticsRouteType) => {
  const selected = eventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is StaffLogisticsEvent => Boolean(event));
  const warnings = new Set<string>();
  selected.forEach((event) => {
    if (event.box === "Sin asignar") warnings.add("FALTA CAJA");
    if (event.operator === "Sin asignar") warnings.add("FALTA OPERADOR");
  });
  for (let index = 0; index < selected.length; index += 1) {
    for (let next = index + 1; next < selected.length; next += 1) {
      const current = selected[index];
      const other = selected[next];
      const currentStart = clockMinutes(current.time);
      const currentEnd = clockMinutes(current.endTime) < currentStart ? clockMinutes(current.endTime) + 1440 : clockMinutes(current.endTime);
      const otherStart = clockMinutes(other.time);
      const otherEnd = clockMinutes(other.endTime) < otherStart ? clockMinutes(other.endTime) + 1440 : clockMinutes(other.endTime);
      if (current.operator !== "Sin asignar" && current.operator === other.operator && currentStart < otherEnd && otherStart < currentEnd) warnings.add("STAFF ASIGNADO A DOS LUGARES");
      if (current.box !== "Sin asignar" && current.box === other.box && currentStart < otherEnd && otherStart < currentEnd) warnings.add("MISMA CAJA EN VENTANAS INCOMPATIBLES");
    }
  }
  if (type === "ASSEMBLY" && selected.some((event) => !event.setupTime)) warnings.add("MONTAJE SIN HORA OBJETIVO");
  return [...warnings];
};

export function StaffLogisticsView({ events }: { events: StaffLogisticsEvent[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [commune, setCommune] = useState("ALL");
  const [operator, setOperator] = useState("ALL");
  const [box, setBox] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeDraft, setRouteDraft] = useState<LogisticsRouteDraft | null>(null);
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
            <h2 id="staff-logistics-title" className="mt-1 text-2xl font-semibold text-white">Eventos</h2>
            <p className="mt-1 text-sm text-white/50">Vista semanal operativa · Eventos, Staff y Caja Negra.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-60 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <input aria-label="Buscar evento, cliente o lugar" className={`${selectClass} w-full pl-9`} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento, cliente o lugar…" value={search} />
            </label>
            <button aria-label="Semana anterior" className="grid size-10 place-items-center rounded-xl border border-white/10 text-white/70 hover:border-brand hover:text-brand" onClick={() => shiftWeek(-1)}><ChevronLeft className="size-4" /></button>
            <button className="min-h-10 rounded-xl border border-brand/50 px-3 text-xs font-semibold text-brand hover:bg-brand/10" onClick={() => setAnchor(monday(new Date()))}>Esta semana</button>
            <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/75"><CalendarDays className="size-4 text-brand" />{longDayFormatter.format(dateOnly(days[0]))} – {longDayFormatter.format(dateOnly(days[6]))}</div>
            <button aria-label="Semana siguiente" className="grid size-10 place-items-center rounded-xl border border-white/10 text-white/70 hover:border-brand hover:text-brand" onClick={() => shiftWeek(1)}><ChevronRight className="size-4" /></button>
            <button className="min-h-10 rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground hover:bg-brand/90" onClick={() => setRouteOpen((open) => !open)}>{routeOpen ? "CERRAR RUTA" : "GENERAR RUTA"}</button>
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#111214] p-2">
        <select aria-label="Filtrar por estado" className={selectClass} onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="PENDING">Por confirmar</option><option value="CANCELLED">Cancelado</option></select>
        <select aria-label="Filtrar por servicio" className={selectClass} onChange={(event) => setService(event.target.value)} value={service}><option value="ALL">Todos los servicios</option>{values.services.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por comuna" className={selectClass} onChange={(event) => setCommune(event.target.value)} value={commune}><option value="ALL">Todas las comunas</option>{values.communes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por operador" className={selectClass} onChange={(event) => setOperator(event.target.value)} value={operator}><option value="ALL">Todos los operadores</option>{values.operators.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por Caja Negra" className={selectClass} onChange={(event) => setBox(event.target.value)} value={box}><option value="ALL">Todas las cajas</option>{values.boxes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        {(search || status !== "ALL" || service !== "ALL" || commune !== "ALL" || operator !== "ALL" || box !== "ALL") && <button className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand" onClick={() => { setSearch(""); setStatus("ALL"); setService("ALL"); setCommune("ALL"); setOperator("ALL"); setBox("ALL"); }}><X className="size-3.5" />Limpiar</button>}
      </div>

      {routeOpen && <RoutePlanner days={days} draft={routeDraft} events={events} onChange={setRouteDraft} />}

      <div className="hidden space-y-2 lg:block">
        {visible.length ? visible.map((event) => <LogisticsRow event={event} key={event.id} onSelect={() => setSelectedId(event.id)} selected={selectedId === event.id} />) : <EmptyState />}
      </div>

      <div className="space-y-2 lg:hidden">{visible.length ? visible.map((event) => <LogisticsMobileCard event={event} key={event.id} onSelect={() => setSelectedId(event.id)} selected={selectedId === event.id} />) : <EmptyState />}</div>
      {selected && <LogisticsDetail event={selected} onClose={() => setSelectedId(null)} routeDraft={routeDraft} />}
    </section>
  );
}

function LogisticsRow({ event, onSelect, selected }: { event: StaffLogisticsEvent; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  const date = dateParts(event.date);
  return <button className={`grid w-full grid-cols-[72px_5px_96px_minmax(0,1.25fr)_minmax(0,1fr)_110px_auto_20px] items-center gap-3 rounded-2xl border border-white/10 bg-[#111214] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[.03] ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect}>
    <span className="text-xs font-semibold leading-tight text-white"><strong className="block text-lg">{date.day}</strong><span className="block text-[10px] text-white/50">{date.weekday} · {date.month}</span></span><span className={`h-12 w-1 rounded-full ${state.bar}`} /><span className="text-sm font-medium text-white/90">{formatTime(event.time)} → {formatTime(event.endTime)}<span className="block text-[10px] text-white/40">Citación {formatTime(event.staffCallAt)}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="mt-0.5 block truncate text-[11px] text-white/45">{event.operator === "Sin asignar" ? "Sin operador" : `Operador · ${event.operator}`} · {event.box === "Sin asignar" ? "Sin caja" : event.box}</span><span className="block truncate text-[10px] text-white/35">M {formatTime(event.setupTime)} · D {formatTime(event.teardownTime)}</span></span><span className="flex min-w-0 items-start gap-1.5 text-xs text-white/65"><MapPin className="mt-0.5 size-3.5 shrink-0 text-white/45" /><span className="min-w-0 truncate">{event.location}<span className="block truncate text-white/35">{event.commune}</span></span></span><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state.color}`}><i className={`size-2 shrink-0 rounded-full ${state.dot}`} />{state.label}</span><span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[11px] font-semibold text-white/75">{event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><ChevronRight className="size-4 text-brand" />
  </button>;
}

function LogisticsMobileCard({ event, onSelect, selected }: { event: StaffLogisticsEvent; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  const date = dateParts(event.date);
  return <button className={`grid w-full grid-cols-[54px_minmax(0,1fr)_18px] gap-3 rounded-2xl border border-white/10 bg-[#111214] p-3 text-left ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect}><span className={`border-r-4 pr-2 ${state.bar}`}><strong className="block text-base text-white">{date.day}</strong><span className="text-[10px] font-semibold text-white/45">{date.weekday}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="mt-0.5 block text-xs text-white/70">{formatTime(event.time)} → {formatTime(event.endTime)} · {event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><span className="mt-1 block truncate text-[11px] text-white/45">{event.location} · {event.commune}</span><span className="mt-1 block truncate text-[11px] text-white/45">Citación {formatTime(event.staffCallAt)} · {event.operator} · {event.box}</span><span className="mt-1 block truncate text-[11px] text-white/45">M {formatTime(event.setupTime)} · D {formatTime(event.teardownTime)}</span><span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${state.color}`}><i className={`size-1.5 rounded-full ${state.dot}`} />{state.label}</span></span><ChevronRight className="mt-1 size-4 text-brand" /></button>;
}

function RoutePlanner({ days, draft, events, onChange }: { days: string[]; draft: LogisticsRouteDraft | null; events: StaffLogisticsEvent[]; onChange: (draft: LogisticsRouteDraft | null) => void }) {
  const [date, setDate] = useState(days[0] ?? "");
  const [type, setType] = useState<LogisticsRouteType>("ASSEMBLY");
  const routeEvents = draft ? draft.eventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is StaffLogisticsEvent => Boolean(event)) : [];
  const warnings = draft ? routeWarnings(events, draft.eventIds, draft.type) : [];
  const generate = () => onChange({ date, type, status: "DRAFT", eventIds: buildLogisticsRouteDraft(events, date, type) });
  const move = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.eventIds.length) return;
    const ids = [...draft.eventIds];
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    onChange({ ...draft, eventIds: ids, status: "DRAFT" });
  };
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4" aria-label="Planificador de rutas"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Planificación operacional</p><h3 className="mt-1 text-lg font-semibold text-white">Generar ruta</h3><p className="mt-1 text-xs text-white/45">Primero respeta ventanas horarias; luego agrupa por comuna. Nada se confirma automáticamente.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Día de ruta" className={selectClass} onChange={(event) => setDate(event.target.value)} value={date}>{days.map((day) => <option key={day} value={day}>{day}</option>)}</select><select aria-label="Tipo de ruta" className={selectClass} onChange={(event) => setType(event.target.value as LogisticsRouteType)} value={type}><option value="ASSEMBLY">Montaje</option><option value="DISASSEMBLY">Desmontaje</option><option value="FULL_DAY">Día completo</option></select><button className="min-h-10 rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground" onClick={generate}>GENERAR RUTA</button></div></div>{draft && <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">Ruta {draft.type === "ASSEMBLY" ? "Montaje" : draft.type === "DISASSEMBLY" ? "Desmontaje" : "Día completo"}</p><span className="rounded-full border border-brand/40 px-2 py-1 text-[10px] font-bold uppercase text-brand">{draft.status}</span></div>{routeEvents.length ? routeEvents.map((event, index) => <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#17181a] p-3" key={`${event.id}-${index}`}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{event.customer}</p><p className="truncate text-xs text-white/50">{event.commune} · Llegar {formatTime(routeTarget(event, draft.type))} · Evento {formatTime(event.time)}</p></div><button aria-label="Subir evento" className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/55 hover:border-brand hover:text-brand" onClick={() => move(index, -1)}>↑</button><button aria-label="Bajar evento" className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/55 hover:border-brand hover:text-brand" onClick={() => move(index, 1)}>↓</button></div>) : <p className="rounded-xl border border-white/10 p-4 text-sm text-white/45">No hay eventos para ese día.</p>}<div className="flex flex-wrap gap-2 pt-1"><button className="min-h-10 rounded-xl border border-brand/50 px-3 text-xs font-semibold text-brand disabled:opacity-40" disabled={!routeEvents.length || draft.status === "CONFIRMED"} onClick={() => onChange({ ...draft, status: "CONFIRMED" })}>CONFIRMAR RUTA</button><span className="self-center text-[11px] text-white/35">La confirmación queda preparada en esta vista; no crea asignaciones ni altera datos canónicos.</span></div></div><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">Advertencias</p>{warnings.length ? <ul className="mt-2 space-y-2 text-xs text-red-300">{warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-300">Sin conflictos evidentes en la proyección.</p>}</div></div>}</section>;
}

function LogisticsDetail({ event, onClose, routeDraft }: { event: StaffLogisticsEvent; onClose: () => void; routeDraft: LogisticsRouteDraft | null }) {
  const state = statusView[normalizeStatus(event.status)];
  const locationHref = event.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}` : null;
  const setupOrder = routeDraft?.type === "ASSEMBLY" ? (routeDraft.eventIds.indexOf(event.id) + 1 || null) : null;
  const teardownOrder = routeDraft?.type === "DISASSEMBLY" ? (routeDraft.eventIds.indexOf(event.id) + 1 || null) : null;
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4 sm:p-5" aria-label="Detalle logístico del evento"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Detalle logístico del evento</p><h3 className="mt-1 text-xl font-semibold text-white">{event.customer}</h3><p className="mt-1 text-xs text-white/45">{event.orbitEventId} · {event.date} · {formatTime(event.time)} → {formatTime(event.endTime)}</p></div><button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 hover:border-brand hover:text-brand" onClick={onClose}><X className="size-4" />Cerrar</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Evento" value={`${event.service}${event.duration ? ` · ${event.duration} horas` : ""}`} /><DetailItem label="Staff" value={`${event.operator} · Citación ${formatTime(event.staffCallAt)}`} /><DetailItem label="Caja Negra / equipo" value={event.box} /><DetailItem label="Estado operativo" value={state.label} tone={state.color} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><DetailItem label="MONTAJE" value={`${event.commune} · ${formatTime(event.setupTime)} · ${event.setupStaff}`} /><DetailItem label="DESMONTAJE" value={`${event.commune} · ${formatTime(event.teardownTime)} · ${event.teardownStaff}`} /></div>{(setupOrder || teardownOrder) && <p className="mt-3 text-xs font-semibold text-brand">ROUTE ORDER · {setupOrder ? `Montaje #${setupOrder}` : `Desmontaje #${teardownOrder}`}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Logística / ruta</p><p className="mt-1 flex items-start gap-2 text-sm text-white/80"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{event.address || `${event.location} · ${event.commune}`}</p><p className="mt-2 text-xs text-white/45">Extras: {event.extras.length ? event.extras.join(" · ") : "Sin extras"}</p></div>{locationHref && <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground" href={locationHref} rel="noreferrer" target="_blank">Ver ubicación</a>}</div></section>;
}

function DetailItem({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) { return <div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/40">{label}</p><p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p></div>; }
function EmptyState() { return <div className="p-8 text-center text-sm text-white/45">No hay eventos que coincidan con la semana y filtros seleccionados.</div>; }
