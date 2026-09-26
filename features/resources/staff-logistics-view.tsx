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

export type LogisticsSort = "TIME" | "COMMUNE" | "SECTOR" | "ASSEMBLY" | "DISASSEMBLY";
export type LogisticsSector = "NORTE" | "ORIENTE" | "CENTRO" | "PONIENTE" | "SUR" | "OTROS";

// Founder-editable defaults. Unknown live communes intentionally fall into OTROS
// until Founder assigns them in the local logistics view.
export const DEFAULT_COMMUNE_SECTOR_MAP: Record<string, LogisticsSector> = {
  Colina: "NORTE",
  Chicureo: "NORTE",
  Lampa: "NORTE",
  Tiltil: "NORTE",
  "Las Condes": "ORIENTE",
  Vitacura: "ORIENTE",
  "Lo Barnechea": "ORIENTE",
  "La Reina": "ORIENTE",
  Santiago: "CENTRO",
  Providencia: "CENTRO",
  Ñuñoa: "CENTRO",
  Pudahuel: "PONIENTE",
  Maipú: "PONIENTE",
  Cerrillos: "PONIENTE",
  "La Florida": "SUR",
  "Puente Alto": "SUR",
  "San Bernardo": "SUR",
};

const sectorOrder: LogisticsSector[] = ["NORTE", "ORIENTE", "CENTRO", "PONIENTE", "SUR", "OTROS"];
const sectorForCommune = (commune: string, overrides: Record<string, LogisticsSector>) => overrides[commune] ?? DEFAULT_COMMUNE_SECTOR_MAP[commune] ?? "OTROS";

const CHILE_TIME_ZONE = "America/Santiago";
const longDayFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const compactDayFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" });

const dateOnly = (value: string) => new Date(`${value}T12:00:00Z`);
const dateParts = (value: string) => {
  const parts = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).formatToParts(dateOnly(value));
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

export const monday = (value: Date) => {
  const result = new Date(value);
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  result.setUTCHours(12, 0, 0, 0);
  return result;
};

const iso = (value: Date) => value.toISOString().slice(0, 10);
const weekDays = (anchor: Date) => Array.from({ length: 7 }, (_, index) => {
  const value = new Date(anchor);
  value.setUTCDate(value.getUTCDate() + index);
  return iso(value);
});

export const chileTodayIso = (now: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CHILE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

export const chileCurrentWeek = (now: Date = new Date()) => {
  const start = monday(dateOnly(chileTodayIso(now)));
  return { start: iso(start), end: iso(new Date(start.getTime() + 6 * 86400000)) };
};

const compactWeekLabel = (start: string, end: string) => `${compactDayFormatter.format(dateOnly(start))} – ${compactDayFormatter.format(dateOnly(end))}`.replaceAll(".", "").toUpperCase();

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
  const [sortBy, setSortBy] = useState<LogisticsSort>("TIME");
  const [groupBySector, setGroupBySector] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [sectorOverrides, setSectorOverrides] = useState<Record<string, LogisticsSector>>({});
  const [anchor, setAnchor] = useState(() => dateOnly(chileCurrentWeek().start));
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
  }).sort((a, b) => {
    const sectorCompare = sectorForCommune(a.commune, sectorOverrides).localeCompare(sectorForCommune(b.commune, sectorOverrides));
    const communeCompare = a.commune.localeCompare(b.commune);
    const setupCompare = clockMinutes(a.setupTime) - clockMinutes(b.setupTime);
    const teardownCompare = clockMinutes(a.teardownTime) - clockMinutes(b.teardownTime);
    if (groupBySector) return sectorCompare || communeCompare || (sortBy === "DISASSEMBLY" ? teardownCompare : setupCompare) || a.time.localeCompare(b.time);
    if (sortBy === "COMMUNE") return communeCompare || a.time.localeCompare(b.time);
    if (sortBy === "SECTOR") return sectorCompare || communeCompare || setupCompare || a.time.localeCompare(b.time);
    if (sortBy === "ASSEMBLY") return setupCompare || a.time.localeCompare(b.time);
    if (sortBy === "DISASSEMBLY") return teardownCompare || a.time.localeCompare(b.time);
    return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
  }), [box, commune, events, groupBySector, operator, search, sectorOverrides, service, sortBy, status, weekSet]);

  const selected = visible.find((event) => event.id === selectedId) ?? null;
  const counts = useMemo(() => events.filter((event) => weekSet.has(event.date)).reduce((result, event) => {
    result.total += 1;
    result[normalizeStatus(event.status)] += 1;
    return result;
  }, { total: 0, CONFIRMED: 0, PENDING: 0, CANCELLED: 0 }), [events, weekSet]);

  const resetToCurrentWeek = () => setAnchor(dateOnly(chileCurrentWeek().start));
  const shiftWeek = (amount: number) => setAnchor((current) => {
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + amount * 7);
    return next;
  });

  return (
    <section className="min-w-0 max-w-full space-y-5 overflow-x-clip" aria-labelledby="staff-logistics-title">
      <header className="rounded-2xl border border-white/10 bg-[#111214] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Logística</p>
            <h2 id="staff-logistics-title" className="mt-1 text-2xl font-semibold text-white">Eventos</h2>
            <p className="mt-1 text-sm text-white/50">Vista semanal operativa · Eventos, Staff y Caja Negra.</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:items-end">
            <div className="flex w-full min-w-0 flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
              <label className="relative min-w-0 w-full flex-1 sm:min-w-[18rem] sm:w-auto sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <input aria-label="Buscar evento, cliente o lugar" className={`${selectClass} w-full pl-9`} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento, cliente o lugar…" value={search} />
              </label>
              <div className="inline-flex min-h-10 w-full min-w-0 flex-1 flex-nowrap items-center justify-between gap-1 rounded-xl border border-white/10 p-1 text-xs text-white/75 sm:w-auto sm:min-w-max sm:flex-none" aria-label="Navegación de rango de fechas">
                <button aria-label="Semana anterior" className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-brand" onClick={() => shiftWeek(-1)}><ChevronLeft className="size-4" /></button>
                <button className="min-h-8 shrink-0 rounded-lg border border-brand/50 px-2.5 text-xs font-semibold text-brand hover:bg-brand/10" onClick={resetToCurrentWeek}>Esta semana</button>
                <span className="hidden min-h-8 shrink-0 items-center gap-2 px-2 sm:inline-flex"><CalendarDays className="size-4 text-brand" />{longDayFormatter.format(dateOnly(days[0]))} – {longDayFormatter.format(dateOnly(days[6]))}</span>
                <span className="inline-flex min-h-8 shrink-0 items-center px-1 text-[11px] font-semibold text-white/80 sm:hidden">{compactWeekLabel(days[0], days[6])}</span>
                <button aria-label="Semana siguiente" className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-brand" onClick={() => shiftWeek(1)}><ChevronRight className="size-4" /></button>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
              <label className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/55 sm:w-auto sm:justify-start">Ordenar por<select aria-label="Ordenar por" className="min-w-0 bg-transparent text-xs text-white/85 outline-none" onChange={(event) => setSortBy(event.target.value as LogisticsSort)} value={sortBy}><option value="TIME">Hora</option><option value="COMMUNE">Comuna</option><option value="SECTOR">Sector</option><option value="ASSEMBLY">Montaje</option><option value="DISASSEMBLY">Desmontaje</option></select></label>
              <button aria-pressed={groupBySector} className={`min-h-10 w-full rounded-xl border px-3 text-xs font-semibold sm:w-auto ${groupBySector ? "border-brand bg-brand/15 text-brand" : "border-white/10 text-white/65 hover:border-brand/50 hover:text-brand"}`} onClick={() => setGroupBySector((value) => !value)}>AGRUPAR POR SECTOR</button>
              {groupBySector && <button className="min-h-10 w-full rounded-xl border border-white/10 px-3 text-xs text-white/65 hover:border-brand/50 hover:text-brand sm:w-auto" onClick={() => setMappingOpen((value) => !value)}>{mappingOpen ? "CERRAR AJUSTES" : "AJUSTAR SECTORES"}</button>}
              <button className="min-h-10 w-full rounded-xl border border-brand/50 px-3 text-xs font-semibold text-brand hover:bg-brand/10 sm:w-auto sm:font-bold" onClick={() => setRouteOpen((open) => !open)}>{routeOpen ? "CERRAR RUTA" : "GENERAR RUTA"}</button>
              <button aria-label="Más opciones de logística" className="grid min-h-10 w-full place-items-center rounded-xl border border-white/10 text-lg text-white/55 hover:border-brand hover:text-brand sm:size-10 sm:w-auto">⋯</button>
            </div>
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

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#111214] p-2 sm:flex sm:flex-wrap">
        <select aria-label="Filtrar por estado" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="PENDING">Por confirmar</option><option value="CANCELLED">Cancelado</option></select>
        <select aria-label="Filtrar por servicio" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setService(event.target.value)} value={service}><option value="ALL">Todos los servicios</option>{values.services.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por comuna" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setCommune(event.target.value)} value={commune}><option value="ALL">Todas las comunas</option>{values.communes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por operador" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setOperator(event.target.value)} value={operator}><option value="ALL">Todos los operadores</option>{values.operators.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por Caja Negra" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setBox(event.target.value)} value={box}><option value="ALL">Todas las cajas</option>{values.boxes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        {(search || status !== "ALL" || service !== "ALL" || commune !== "ALL" || operator !== "ALL" || box !== "ALL") && <button className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand sm:col-auto" onClick={() => { setSearch(""); setStatus("ALL"); setService("ALL"); setCommune("ALL"); setOperator("ALL"); setBox("ALL"); }}><X className="size-3.5" />Limpiar</button>}
      </div>

      {groupBySector && mappingOpen && <SectorMappingEditor communes={values.communes} overrides={sectorOverrides} onChange={(next) => setSectorOverrides(next)} />}

      {routeOpen && <RoutePlanner days={days} draft={routeDraft} events={events} onChange={setRouteDraft} />}

      <LogisticsEventList events={visible} groupBySector={groupBySector} overrides={sectorOverrides} onSelect={setSelectedId} selectedId={selectedId} />
      {selected && <LogisticsDetail event={selected} onClose={() => setSelectedId(null)} overrides={sectorOverrides} routeDraft={routeDraft} />}
    </section>
  );
}

function LogisticsEventList({ events, groupBySector, overrides, onSelect, selectedId }: { events: StaffLogisticsEvent[]; groupBySector: boolean; overrides: Record<string, LogisticsSector>; onSelect: (id: string) => void; selectedId: string | null }) {
  if (!events.length) return <EmptyState />;
  const row = (event: StaffLogisticsEvent) => <><div className="hidden lg:block"><LogisticsRow event={event} sector={sectorForCommune(event.commune, overrides)} onSelect={() => onSelect(event.id)} selected={selectedId === event.id} /></div><div className="lg:hidden"><LogisticsMobileCard event={event} sector={sectorForCommune(event.commune, overrides)} onSelect={() => onSelect(event.id)} selected={selectedId === event.id} /></div></>;
  if (!groupBySector) return <div className="space-y-2">{events.map(row)}</div>;
  const grouped = new Map<LogisticsSector, Map<string, StaffLogisticsEvent[]>>();
  for (const event of events) {
    const sector = sectorForCommune(event.commune, overrides);
    const communes = grouped.get(sector) ?? new Map<string, StaffLogisticsEvent[]>();
    communes.set(event.commune, [...(communes.get(event.commune) ?? []), event]);
    grouped.set(sector, communes);
  }
  return <div className="space-y-3">{sectorOrder.filter((sector) => grouped.has(sector)).map((sector) => <details className="rounded-2xl border border-white/10 bg-[#111214] p-3" key={sector} open><summary className="cursor-pointer list-none text-sm font-semibold text-white"><span className="text-brand">SECTOR {sector}</span><span className="ml-2 text-xs font-normal text-white/45">{[...(grouped.get(sector)?.values() ?? [])].reduce((total, items) => total + items.length, 0)} eventos</span></summary><div className="mt-3 space-y-3">{[...(grouped.get(sector)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([commune, communeEvents]) => <details className="rounded-xl border border-white/10 bg-[#17181a] p-2" key={commune} open><summary className="cursor-pointer list-none px-2 py-1 text-xs font-semibold uppercase tracking-[.16em] text-white/60">{commune}<span className="ml-2 text-[10px] font-normal text-white/35">({communeEvents.length})</span></summary><div className="mt-2 space-y-2">{communeEvents.map(row)}</div></details>)}</div></details>)}</div>;
}

function SectorMappingEditor({ communes, overrides, onChange }: { communes: string[]; overrides: Record<string, LogisticsSector>; onChange: (next: Record<string, LogisticsSector>) => void }) {
  return <section className="rounded-2xl border border-brand/20 bg-[#111214] p-3" aria-label="Ajustes de sector por comuna"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Mapping comuna → sector</p><p className="mt-1 text-xs text-white/45">Ajuste local para la vista de Founder; no modifica datos del evento.</p></div><span className="text-[10px] uppercase tracking-[.14em] text-white/35">{communes.length} comunas</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{communes.map((commune) => <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#17181a] px-3 py-2 text-xs text-white/70" key={commune}><span className="truncate">{commune}</span><select aria-label={`Sector de ${commune}`} className="max-w-28 bg-transparent text-right text-xs text-brand outline-none" onChange={(event) => onChange({ ...overrides, [commune]: event.target.value as LogisticsSector })} value={overrides[commune] ?? DEFAULT_COMMUNE_SECTOR_MAP[commune] ?? "OTROS"}>{sectorOrder.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label>)}</div></section>;
}

function LogisticsRow({ event, sector, onSelect, selected }: { event: StaffLogisticsEvent; sector: LogisticsSector; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  const date = dateParts(event.date);
  return <button className={`grid w-full grid-cols-[72px_5px_96px_minmax(0,1.25fr)_minmax(0,1fr)_110px_auto_20px] items-center gap-3 rounded-2xl border border-white/10 bg-[#111214] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[.03] ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect}>
    <span className="text-xs font-semibold leading-tight text-white"><strong className="block text-lg">{date.day}</strong><span className="block text-[10px] text-white/50">{date.weekday} · {date.month}</span></span><span className={`h-12 w-1 rounded-full ${state.bar}`} /><span className="text-sm font-medium text-white/90">{formatTime(event.time)} → {formatTime(event.endTime)}<span className="block text-[10px] text-white/40">Citación {formatTime(event.staffCallAt)}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="mt-0.5 block truncate text-[11px] text-white/45">{event.operator === "Sin asignar" ? "Sin operador" : `Operador · ${event.operator}`} · {event.box === "Sin asignar" ? "Sin caja" : event.box}</span><span className="block truncate text-[10px] text-white/35">M {formatTime(event.setupTime)} · D {formatTime(event.teardownTime)}</span></span><span className="flex min-w-0 items-start gap-1.5 text-xs text-white/65"><MapPin className="mt-0.5 size-3.5 shrink-0 text-white/45" /><span className="min-w-0 truncate">{event.location}<span className="block truncate text-white/35">{event.commune} · {sector}</span></span></span><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state.color}`}><i className={`size-2 shrink-0 rounded-full ${state.dot}`} />{state.label}</span><span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[11px] font-semibold text-white/75">{event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><ChevronRight className="size-4 text-brand" />
  </button>;
}

function LogisticsMobileCard({ event, sector, onSelect, selected }: { event: StaffLogisticsEvent; sector: LogisticsSector; onSelect: () => void; selected: boolean }) {
  const state = statusView[normalizeStatus(event.status)];
  const date = dateParts(event.date);
  return <button className={`grid min-h-[72px] w-full min-w-0 grid-cols-[38px_3px_54px_72px_68px_55px_43px_14px] items-center gap-x-1 overflow-hidden rounded-2xl border border-white/10 bg-[#111214] px-1.5 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[.03] ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect}>
    <span className="flex min-h-[58px] flex-col items-center justify-center text-center">
      <strong className="text-[9px] font-bold uppercase leading-none text-white/60">{date.weekday}</strong>
      <strong className="mt-0.5 text-[19px] leading-none text-white">{date.day}</strong>
      <span className="mt-0.5 text-[9px] font-semibold uppercase leading-none text-white/40">{date.month}</span>
    </span>
    <span aria-hidden="true" className={`h-12 w-1 self-center rounded-full ${state.bar}`} />
    <span className="min-w-0 truncate text-[10px] font-semibold leading-tight text-white/80">{formatTime(event.time)} → {formatTime(event.endTime)}</span>
    <strong className="min-w-0 truncate text-[10px] font-semibold leading-tight text-white">{event.customer}</strong>
    <span className="min-w-0 line-clamp-2 text-[9px] leading-tight text-white/50">{event.location}<br />{event.commune} · {sector}</span>
    <span className={`inline-flex min-w-0 items-center gap-1 truncate text-[9px] ${state.color}`}><i className={`size-1.5 shrink-0 rounded-full ${state.dot}`} />{state.label}</span>
    <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/[.05] px-1 py-0.5 text-center text-[8px] font-semibold text-white/70">{event.service}</span>
    <ChevronRight className="size-4 text-brand" />
  </button>;
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

function LogisticsDetail({ event, onClose, overrides, routeDraft }: { event: StaffLogisticsEvent; onClose: () => void; overrides: Record<string, LogisticsSector>; routeDraft: LogisticsRouteDraft | null }) {
  const state = statusView[normalizeStatus(event.status)];
  const locationHref = event.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}` : null;
  const setupOrder = routeDraft?.type === "ASSEMBLY" ? (routeDraft.eventIds.indexOf(event.id) + 1 || null) : null;
  const teardownOrder = routeDraft?.type === "DISASSEMBLY" ? (routeDraft.eventIds.indexOf(event.id) + 1 || null) : null;
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4 sm:p-5" aria-label="Detalle logístico del evento"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Detalle logístico del evento</p><h3 className="mt-1 text-xl font-semibold text-white">{event.customer}</h3><p className="mt-1 text-xs text-white/45">{event.orbitEventId} · {event.date} · {formatTime(event.time)} → {formatTime(event.endTime)}</p></div><button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 hover:border-brand hover:text-brand" onClick={onClose}><X className="size-4" />Cerrar</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Evento" value={`${event.service}${event.duration ? ` · ${event.duration} horas` : ""}`} /><DetailItem label="Staff" value={`${event.operator} · Citación ${formatTime(event.staffCallAt)}`} /><DetailItem label="Caja Negra / equipo" value={event.box} /><DetailItem label="Estado operativo" value={state.label} tone={state.color} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="COMUNA" value={event.commune} /><DetailItem label="SECTOR" value={sectorForCommune(event.commune, overrides)} /><DetailItem label="MONTAJE" value={`${formatTime(event.setupTime)} · ${event.setupStaff}`} /><DetailItem label="DESMONTAJE" value={`${formatTime(event.teardownTime)} · ${event.teardownStaff}`} /></div>{(setupOrder || teardownOrder) && <p className="mt-3 text-xs font-semibold text-brand">ROUTE ORDER · {setupOrder ? `Montaje #${setupOrder}` : `Desmontaje #${teardownOrder}`}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Logística / ruta</p><p className="mt-1 flex items-start gap-2 text-sm text-white/80"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{event.address || `${event.location} · ${event.commune}`}</p><p className="mt-2 text-xs text-white/45">Extras: {event.extras.length ? event.extras.join(" · ") : "Sin extras"}</p></div>{locationHref && <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground" href={locationHref} rel="noreferrer" target="_blank">Ver ubicación</a>}</div></section>;
}

function DetailItem({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) { return <div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/40">{label}</p><p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p></div>; }
function EmptyState() { return <div className="p-8 text-center text-sm text-white/45">No hay eventos que coincidan con la semana y filtros seleccionados.</div>; }
