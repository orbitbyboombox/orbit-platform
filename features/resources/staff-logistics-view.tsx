"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { updateCommuneSectorAction } from "./logistics-commune-sector-actions";
import { publishLogisticsRouteAction, saveLogisticsRoutePlanAction } from "./logistics-route-publication.actions";
import { assignBlackBoxToEventAction } from "@/features/asset-management/event-black-box.actions";
import {
  LOGISTICS_SECTORS,
  canonicalCommuneName,
  defaultSectorForCommune,
  normalizeCommune,
  type CommuneSectorMapping,
  type LogisticsSector,
} from "./logistics-commune-catalog";

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
  operatorStaffId?: string;
  setupStaffId?: string;
  teardownStaffId?: string;
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
  routeId?: string;
  date: string;
  type: LogisticsRouteType;
  status: "DRAFT" | "ORDERED" | "PUBLISHED" | "MODIFIED";
  eventIds: string[];
  vehicleId: string;
  driverId: string;
  staffIds: string[];
};
export type AdminLogisticsRoute = { id: string; date: string; type: LogisticsRouteType; status: "DRAFT" | "ORDERED" | "PUBLISHED" | "MODIFIED"; version: number; vehicleId: string; driverId: string; staffIds: string[]; eventIds: string[] };
export type LogisticsVehicleOption = { id: string; label: string };
export type LogisticsStaffOption = { id: string; label: string };
export type LogisticsBoxOption = { id: string; code: string; status: "AVAILABLE" | "ASSIGNED" | "MAINTENANCE" | "OUT_OF_SERVICE"; conflictingProjectIds?: string[] };

export type LogisticsSort = "TIME" | "COMMUNE" | "SECTOR" | "ASSEMBLY" | "DISASSEMBLY";
const sectorOrder: LogisticsSector[] = [...LOGISTICS_SECTORS];
export { DEFAULT_COMMUNE_SECTOR_MAP } from "./logistics-commune-catalog";
const sectorForCommune = (commune: string, overrides: Record<string, LogisticsSector>) => overrides[normalizeCommune(commune)] ?? defaultSectorForCommune(commune);

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
const automaticStaffIds = (events: readonly StaffLogisticsEvent[]) => [...new Set(events.flatMap((event) => [event.operatorStaffId, event.setupStaffId, event.teardownStaffId]).filter((id): id is string => Boolean(id)))];
export const buildLogisticsRouteDraft = (events: readonly StaffLogisticsEvent[], date: string, type: LogisticsRouteType) => events
  .filter((event) => event.date === date)
  .sort((a, b) => clockMinutes(routeTarget(a, type)) - clockMinutes(routeTarget(b, type)) || a.commune.localeCompare(b.commune) || a.customer.localeCompare(b.customer))
  .map((event) => event.projectId);
const routeEventForProjectId = (events: readonly StaffLogisticsEvent[], projectId: string) =>
  events.find((event) => event.projectId === projectId || event.id === projectId);
const routeWarnings = (events: readonly StaffLogisticsEvent[], eventIds: readonly string[], type: LogisticsRouteType) => {
  const selected = eventIds.map((id) => routeEventForProjectId(events, id)).filter((event): event is StaffLogisticsEvent => Boolean(event));
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

export function StaffLogisticsView({ events, initialCommuneSectorMappings, initialRoutes = [], vehicles = [], staffOptions = [], boxOptions = [] }: { events: StaffLogisticsEvent[]; initialCommuneSectorMappings: CommuneSectorMapping[]; initialRoutes?: AdminLogisticsRoute[]; vehicles?: LogisticsVehicleOption[]; staffOptions?: LogisticsStaffOption[]; boxOptions?: LogisticsBoxOption[] }) {
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
  const initialOverrides = useMemo(() => Object.fromEntries(initialCommuneSectorMappings.map((mapping) => [normalizeCommune(mapping.commune), mapping.sector])), [initialCommuneSectorMappings]);
  const [sectorOverrides, setSectorOverrides] = useState<Record<string, LogisticsSector>>(initialOverrides);
  const [mappingStatus, setMappingStatus] = useState<Record<string, "GUARDANDO" | "GUARDADO" | "ERROR">>({});
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
    <section className="min-w-0 max-w-full overflow-x-clip" data-debug="logistics-root" aria-labelledby="staff-logistics-title">
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

      <div className="w-full min-w-0 max-w-full space-y-5" data-debug="logistics-shared">
      <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#111214] p-2 sm:flex sm:flex-wrap" data-debug="filters">
        <select aria-label="Filtrar por estado" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Todos los estados</option><option value="CONFIRMED">Confirmado</option><option value="PENDING">Por confirmar</option><option value="CANCELLED">Cancelado</option></select>
        <select aria-label="Filtrar por servicio" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setService(event.target.value)} value={service}><option value="ALL">Todos los servicios</option>{values.services.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por comuna" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setCommune(event.target.value)} value={commune}><option value="ALL">Todas las comunas</option>{values.communes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por operador" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setOperator(event.target.value)} value={operator}><option value="ALL">Todos los operadores</option>{values.operators.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filtrar por Caja Negra" className={`${selectClass} min-w-0 w-full`} onChange={(event) => setBox(event.target.value)} value={box}><option value="ALL">Todas las cajas</option>{values.boxes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        {(search || status !== "ALL" || service !== "ALL" || commune !== "ALL" || operator !== "ALL" || box !== "ALL") && <button className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand sm:col-auto" onClick={() => { setSearch(""); setStatus("ALL"); setService("ALL"); setCommune("ALL"); setOperator("ALL"); setBox("ALL"); }}><X className="size-3.5" />Limpiar</button>}
      </div>

      {groupBySector && mappingOpen && <SectorMappingEditor mappings={initialCommuneSectorMappings} overrides={sectorOverrides} statuses={mappingStatus} onChange={async (commune, nextSector) => {
        const key = normalizeCommune(commune);
        const previous = sectorOverrides[key];
        setSectorOverrides((current) => ({ ...current, [key]: nextSector }));
        setMappingStatus((current) => ({ ...current, [key]: "GUARDANDO" }));
        const result = await updateCommuneSectorAction({ commune, sector: nextSector });
        if (!result.ok) {
          setSectorOverrides((current) => ({ ...current, [key]: previous ?? "OTROS" }));
          setMappingStatus((current) => ({ ...current, [key]: "ERROR" }));
        } else setMappingStatus((current) => ({ ...current, [key]: "GUARDADO" }));
      }} />}

      {routeOpen && <RoutePlanner days={days} draft={routeDraft} events={events} onChange={setRouteDraft} initialRoutes={initialRoutes} vehicles={vehicles} staffOptions={staffOptions} />}

      <LogisticsEventList events={visible} groupBySector={groupBySector} overrides={sectorOverrides} onSelect={setSelectedId} selectedId={selectedId} boxOptions={boxOptions} />
      </div>
      {selected && <LogisticsDetail event={selected} onClose={() => setSelectedId(null)} overrides={sectorOverrides} routeDraft={routeDraft} />}
      <LayoutDebugPanel />
    </section>
  );
}

type LayoutDebugNode = {
  name: string;
  tag: string;
  left: number;
  right: number;
  width: number;
  height: number;
  display: string;
  position: string;
  computedWidth: string;
  minWidth: string;
  maxWidth: string;
  marginLeft: string;
  marginRight: string;
  paddingLeft: string;
  paddingRight: string;
  transform: string;
  transformOrigin: string;
  overflow: string;
  overflowX: string;
  overflowY: string;
  boxSizing: string;
  flex: string;
  flexBasis: string;
  flexGrow: string;
  flexShrink: string;
  alignSelf: string;
  justifySelf: string;
  gridColumn: string;
  gridTemplateColumns: string;
  zoom: string;
  offsetWidth: number;
  clientWidth: number;
  scrollWidth: number;
  parent: string;
  className: string;
  inlineStyle: string;
  dataAttributes: Record<string, string>;
};

function inspectLayoutNode(name: string, element: HTMLElement): LayoutDebugNode {
  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const computedStyles = {
    display: computed.display,
    position: computed.position,
    computedWidth: computed.width,
    minWidth: computed.minWidth,
    maxWidth: computed.maxWidth,
    marginLeft: computed.marginLeft,
    marginRight: computed.marginRight,
    paddingLeft: computed.paddingLeft,
    paddingRight: computed.paddingRight,
    transform: computed.transform,
    transformOrigin: computed.transformOrigin,
    overflow: computed.overflow,
    overflowX: computed.overflowX,
    overflowY: computed.overflowY,
    boxSizing: computed.boxSizing,
    flex: computed.flex,
    flexBasis: computed.flexBasis,
    flexGrow: computed.flexGrow,
    flexShrink: computed.flexShrink,
    alignSelf: computed.alignSelf,
    justifySelf: computed.justifySelf,
    gridColumn: computed.gridColumn,
    gridTemplateColumns: computed.gridTemplateColumns,
    zoom: computed.zoom,
  };
  const dataAttributes = Object.fromEntries(
    Array.from(element.attributes).filter((attribute) => attribute.name.startsWith("data-")).map((attribute) => [attribute.name, attribute.value]),
  );
  return {
    name,
    tag: element.tagName,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
    ...computedStyles,
    offsetWidth: element.offsetWidth,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    parent: element.parentElement?.dataset.debug ?? element.parentElement?.tagName ?? "NONE",
    className: element.className,
    inlineStyle: element.getAttribute("style") ?? "",
    dataAttributes,
  };
}

function LayoutDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get("layoutDebug") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const page = document.getElementById("platform-workspace-content");
    if (page) page.dataset.debug = "page-container";
    const update = () => {
      const find = (name: string) => document.querySelector<HTMLElement>(`[data-debug="${name}"]`);
      const pageElement = page;
      const staff = find("staff-workspaces");
      const logistics = find("logistics-root");
      const shared = find("logistics-shared");
      const filters = find("filters");
      const list = find("event-list");
      const row = find("mobile-row");
      const host = find("scaled-host");
      const inner = find("scaled-inner");
      const button = find("event-button");
      if (!filters || !list || !row || !host || !inner || !button) return;
      const nodes = [
        ["page-container", pageElement], ["staff-workspaces", staff], ["logistics-root", logistics],
        ["logistics-shared", shared], ["filters", filters], ["event-list", list], ["mobile-row", row],
        ["scaled-host", host], ["scaled-inner", inner], ["event-button", button],
      ].filter((entry): entry is [string, HTMLElement] => Boolean(entry[1])).map(([name, element]) => [name, inspectLayoutNode(name, element)] as const);
      const filterRect = filters.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const ancestors: LayoutDebugNode[] = [];
      let current: HTMLElement | null = button.parentElement;
      while (current) {
        ancestors.push(inspectLayoutNode(`ancestor-${ancestors.length}`, current));
        if (current.id === "platform-workspace-content") break;
        current = current.parentElement;
      }
      const firstNarrowing = ancestors.find((node) => node.width < filterRect.width - 4)?.name ?? "NONE";
      const firstOffset = ancestors.find((node) => node.left - filterRect.left > 4)?.name ?? "NONE";
      const engineTouched = ancestors.filter((node) => Object.keys(node.dataAttributes).some((key) => ["data-workspace-ordering-parent", "data-workspace-key", "data-workspace-label"].includes(key)) || ["workspace-draggable", "workspace-menu-host"].some((name) => node.className.includes(name))).map((node) => node.name);
      const viewport = {
        windowInnerWidth: window.innerWidth,
        windowOuterWidth: window.outerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        devicePixelRatio: window.devicePixelRatio,
        visualViewportWidth: window.visualViewport?.width ?? null,
        visualViewportScale: window.visualViewport?.scale ?? null,
      };
      setDiagnostic({
        viewport,
        nodes: Object.fromEntries(nodes),
        scale: {
          logicalRowWidthPx: Number(host.dataset.debugLogicalWidth),
          availableWidthState: Number(host.dataset.debugAvailableWidth),
          hostWidth: hostRect.width,
          calculatedScale: Number(host.dataset.debugScale),
          innerLayoutWidth: parseFloat(getComputedStyle(inner).width),
          innerVisualWidth: innerRect.width,
          buttonWidth: buttonRect.width,
          expectedVisualWidth: 680 * Number(host.dataset.debugScale),
          deltaInnerHost: innerRect.width - hostRect.width,
        },
        comparison: {
          filter: { left: filterRect.left, right: filterRect.right, width: filterRect.width },
          eventList: (() => { const rect = list.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; })(),
          mobileRow: (() => { const rect = row.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; })(),
          scaledHost: { left: hostRect.left, right: hostRect.right, width: hostRect.width },
          eventButton: { left: buttonRect.left, right: buttonRect.right, width: buttonRect.width },
        },
        firstNarrowingAncestor: firstNarrowing,
        firstHorizontalOffsetAncestor: firstOffset,
        globalLayoutEngineTouchesLogisticsTree: engineTouched.length > 0 ? "YES" : "NO",
        elementsTouchedByGlobalLayoutEngine: engineTouched,
        ancestors,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    const mutationObserver = new MutationObserver(update);
    if (page) mutationObserver.observe(page, { attributes: true, attributeFilter: ["style", "class", "data-workspace-key", "data-workspace-ordering-parent"], subtree: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const timer = window.setInterval(update, 500);
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.clearInterval(timer);
      if (page?.dataset.debug === "page-container") delete page.dataset.debug;
    };
  }, [enabled]);

  if (!enabled) return null;
  const text = JSON.stringify(diagnostic, null, 2);
  return <aside style={{ position: "fixed", zIndex: 2147483647, left: 8, right: 8, bottom: 8, maxHeight: "70vh", overflow: "auto", border: "1px solid #f78900", borderRadius: 8, background: "#050607", color: "#f5f5f5", padding: 8, fontFamily: "monospace", fontSize: 10, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", position: "sticky", top: 0, background: "#050607", paddingBottom: 6 }}>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); }}>[{copied ? "COPIADO" : "COPIAR DIAGNÓSTICO"}]</button>
      <button type="button" onClick={() => setEnabled(false)}>[CERRAR]</button>
    </div>
    <pre style={{ margin: 0 }}>{text || "Recolectando diagnóstico…"}</pre>
  </aside>;
}

function LogisticsEventList({ events, groupBySector, overrides, onSelect, selectedId, boxOptions }: { events: StaffLogisticsEvent[]; groupBySector: boolean; overrides: Record<string, LogisticsSector>; onSelect: (id: string) => void; selectedId: string | null; boxOptions: LogisticsBoxOption[] }) {
  if (!events.length) return <EmptyState />;
  const desktopRow = (event: StaffLogisticsEvent) => <div key={event.id}><LogisticsEventRow event={event} sector={sectorForCommune(event.commune, overrides)} onSelect={() => onSelect(event.id)} selected={selectedId === event.id} boxOptions={boxOptions} /></div>;
  const mobileRow = (event: StaffLogisticsEvent) => <div className="w-full min-w-0 max-w-full overflow-visible" data-debug="mobile-row" key={event.id}><ScaledLogisticsEventRow event={event} sector={sectorForCommune(event.commune, overrides)} onSelect={() => onSelect(event.id)} selected={selectedId === event.id} boxOptions={boxOptions} /></div>;
  if (!groupBySector) return <><div className="hidden w-full min-w-0 max-w-full space-y-2 lg:block">{events.map(desktopRow)}</div><div className="w-full min-w-0 max-w-full lg:hidden" data-debug="event-list"><div className="w-full min-w-0 max-w-full space-y-2">{events.map(mobileRow)}</div></div></>;
  const grouped = new Map<LogisticsSector, Map<string, StaffLogisticsEvent[]>>();
  for (const event of events) {
    const sector = sectorForCommune(event.commune, overrides);
    const communes = grouped.get(sector) ?? new Map<string, StaffLogisticsEvent[]>();
    const canonicalCommune = canonicalCommuneName(event.commune);
    communes.set(canonicalCommune, [...(communes.get(canonicalCommune) ?? []), event]);
    grouped.set(sector, communes);
  }
  const groupedRows = (renderRow: (event: StaffLogisticsEvent) => ReactNode) => <div className="w-full max-w-full min-w-0 space-y-3">{sectorOrder.filter((sector) => grouped.has(sector)).map((sector) => <details className="rounded-2xl border border-white/10 bg-[#111214] p-0 lg:p-3" key={sector} open><summary className="cursor-pointer list-none px-1 py-2 text-sm font-semibold text-white lg:px-0"><span className="text-brand">SECTOR {sector}</span><span className="ml-2 text-xs font-normal text-white/45">{[...(grouped.get(sector)?.values() ?? [])].reduce((total, items) => total + items.length, 0)} eventos</span></summary><div className="mt-2 space-y-3 lg:mt-3">{[...(grouped.get(sector)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([commune, communeEvents]) => <details className="rounded-xl border border-white/10 bg-[#17181a] p-0 lg:p-2" key={commune} open><summary className="cursor-pointer list-none px-1 py-1 text-xs font-semibold uppercase tracking-[.16em] text-white/60 lg:px-2">{commune}<span className="ml-2 text-[10px] font-normal text-white/35">({communeEvents.length})</span></summary><div className="mt-2 space-y-2">{communeEvents.map(renderRow)}</div></details>)}</div></details>)}</div>;
  return <><div className="hidden w-full min-w-0 max-w-full lg:block">{groupedRows(desktopRow)}</div><div className="w-full min-w-0 max-w-full lg:hidden" data-debug="event-list">{groupedRows(mobileRow)}</div></>;
}

function SectorMappingEditor({ mappings, overrides, statuses, onChange }: { mappings: CommuneSectorMapping[]; overrides: Record<string, LogisticsSector>; statuses: Record<string, "GUARDANDO" | "GUARDADO" | "ERROR">; onChange: (commune: string, sector: LogisticsSector) => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LogisticsSector | "ALL">("ALL");
  const visible = mappings.filter((mapping) => {
    const selected = overrides[normalizeCommune(mapping.commune)] ?? mapping.sector;
    return (!search.trim() || mapping.commune.toLocaleLowerCase("es-CL").includes(search.trim().toLocaleLowerCase("es-CL"))) && (filter === "ALL" || selected === filter);
  });
  const configured = mappings.filter((mapping) => mapping.source === "PERSISTED").length;
  return <section className="rounded-2xl border border-brand/20 bg-[#111214] p-3" aria-label="Ajustes de sector por comuna"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Mapping comuna → sector</p><p className="mt-1 text-xs text-white/45">Catálogo persistente para Founder; cada cambio se guarda inmediatamente.</p></div><span className="text-[10px] uppercase tracking-[.14em] text-white/35">{mappings.length} COMUNAS · REGIÓN METROPOLITANA · {configured} CONFIGURADAS</span></div><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input aria-label="Buscar comuna" className={`${selectClass} w-full`} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar comuna…" value={search} /><select aria-label="Filtrar comunas por sector" className={selectClass} onChange={(event) => setFilter(event.target.value as LogisticsSector | "ALL")} value={filter}><option value="ALL">TODOS</option>{sectorOrder.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{visible.map((mapping) => { const key = normalizeCommune(mapping.commune); const selected = overrides[key] ?? mapping.sector; const state = statuses[key]; return <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#17181a] px-3 py-2 text-xs text-white/70" key={mapping.commune}><span className="min-w-0 truncate">{mapping.commune}</span><span className="flex shrink-0 items-center gap-2"><span className={state === "ERROR" ? "text-red-400" : "text-white/35"}>{state === "GUARDANDO" ? "GUARDANDO" : state === "GUARDADO" ? "GUARDADO ✓" : state === "ERROR" ? "ERROR AL GUARDAR" : ""}</span><select aria-label={`Sector de ${mapping.commune}`} className="max-w-28 bg-transparent text-right text-xs text-brand outline-none" onChange={(event) => { void onChange(mapping.commune, event.target.value as LogisticsSector); }} value={selected}>{sectorOrder.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></span></label>; })}</div></section>;
}

const LOGICAL_ROW_WIDTH_PX = 680;
const LOGICAL_ROW_HEIGHT_PX = 112;

export function ScaledLogisticsEventRow({ event, sector, onSelect, selected, boxOptions = [] }: { event: StaffLogisticsEvent; sector: LogisticsSector; onSelect: () => void; selected: boolean; boxOptions?: LogisticsBoxOption[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(LOGICAL_ROW_HEIGHT_PX);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateWidth = () => setAvailableWidth(host.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const row = innerRef.current?.querySelector("button");
    if (!row) return;
    const updateHeight = () => setNaturalHeight(Math.max(LOGICAL_ROW_HEIGHT_PX, Math.ceil(row.scrollHeight)));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, (availableWidth || 358) / LOGICAL_ROW_WIDTH_PX);
  return <div ref={hostRef} className="w-full min-w-0 max-w-full overflow-x-clip" data-debug="scaled-host" data-debug-available-width={availableWidth} data-debug-scale={scale} data-debug-logical-width={LOGICAL_ROW_WIDTH_PX} style={{ width: "100%", height: `${naturalHeight * scale}px` }}>
    <div ref={innerRef} className="origin-top-left" data-debug="scaled-inner" style={{ width: `${LOGICAL_ROW_WIDTH_PX}px`, transform: `scale(${scale})` }}>
      <LogisticsEventRow event={event} sector={sector} onSelect={onSelect} selected={selected} boxOptions={boxOptions} />
    </div>
  </div>;
}

export function LogisticsEventRow({ event, sector, onSelect, selected, boxOptions = [] }: { event: StaffLogisticsEvent; sector: LogisticsSector; onSelect: () => void; selected: boolean; boxOptions?: LogisticsBoxOption[] }) {
  const state = statusView[normalizeStatus(event.status)];
  const date = dateParts(event.date);
  const handleKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      onSelect();
    }
  };
  return <div data-debug="event-button" role="button" tabIndex={0} className={`relative grid w-full min-w-0 grid-cols-[72px_5px_96px_minmax(0,1.25fr)_minmax(0,1fr)_110px_auto_20px] items-center gap-3 overflow-visible rounded-2xl border border-white/10 bg-[#111214] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[.03] ${selected ? "border-brand/60 bg-brand/5" : ""}`} onClick={onSelect} onKeyDown={handleKeyDown}>
    <span className="text-xs font-semibold leading-tight text-white"><strong className="block text-lg">{date.day}</strong><span className="block text-[10px] text-white/50">{date.weekday} · {date.month}</span></span><span className={`h-12 w-1 rounded-full ${state.bar}`} /><span className="text-sm font-medium text-white/90">{formatTime(event.time)} → {formatTime(event.endTime)}<span className="block text-[10px] text-white/40">Citación {formatTime(event.staffCallAt)}</span></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{event.customer}</strong><span className="mt-0.5 block truncate text-[11px] text-white/45">{event.operator === "Sin asignar" ? "Sin operador" : `Operador · ${event.operator}`}</span><span className="block truncate text-[10px] text-white/35">M {formatTime(event.setupTime)} · D {formatTime(event.teardownTime)}</span><QuickBoxAssignment event={event} options={boxOptions} /></span><span className="flex min-w-0 items-start gap-1.5 text-xs text-white/65"><MapPin className="mt-0.5 size-3.5 shrink-0 text-white/45" /><span className="min-w-0 truncate">{event.location}<span className="block truncate text-white/35">{event.commune} · {sector}</span></span></span><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state.color}`}><i className={`size-2 shrink-0 rounded-full ${state.dot}`} />{state.label}</span><span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[11px] font-semibold text-white/75">{event.service}{event.duration ? ` · ${event.duration}h` : ""}</span><ChevronRight className="size-4 text-brand" />
  </div>;
}

const boxLabel = (code: string) => {
  const number = Number(code.replace("CASE-", ""));
  return Number.isFinite(number) ? `Caja ${number}` : code;
};

const boxStatusLabel = (status: LogisticsBoxOption["status"]) => status === "AVAILABLE" ? "DISPONIBLE" : status === "ASSIGNED" ? "ASIGNADA" : "NO DISPONIBLE";

function QuickBoxAssignment({ event, options }: { event: StaffLogisticsEvent; options: LogisticsBoxOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const current = options.find((option) => option.code === event.box || boxLabel(option.code) === event.box);
  const assign = (assetId: string) => {
    setMessage("");
    setOpen(false);
    startTransition(async () => {
      const result = await assignBlackBoxToEventAction({ projectId: event.projectId, assetId, reason: "Asignación rápida desde Logística" });
      if (!result.ok) setMessage(result.error);
      else router.refresh();
    });
  };
  return <div className="relative mt-1 flex min-w-0 items-center gap-1" onClick={(clickEvent) => clickEvent.stopPropagation()} onKeyDown={(keyboardEvent) => keyboardEvent.stopPropagation()}>
    <button type="button" className="max-w-full truncate rounded-md border border-brand/30 px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/10 disabled:opacity-50" disabled={pending || !options.length} onClick={() => setOpen((value) => !value)}>{pending ? "GUARDANDO…" : current ? `${boxLabel(current.code)} · CAMBIAR` : "⚠ FALTA CAJA · ASIGNAR"}</button>
    {open && <div className="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-48 overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-[#17181a] p-1.5 shadow-2xl" role="listbox" aria-label={`Asignar caja a ${event.customer}`}>{options.map((option) => { const isCurrent = current?.id === option.id; const conflictsThisEvent = option.conflictingProjectIds?.includes(event.projectId) ?? false; const unavailable = option.status === "MAINTENANCE" || option.status === "OUT_OF_SERVICE"; const disabled = !isCurrent && (unavailable || conflictsThisEvent); const label = isCurrent ? "ACTUAL" : conflictsThisEvent ? "OCUPADA / SIN MARGEN SUFICIENTE" : unavailable ? boxStatusLabel(option.status) : "DISPONIBLE"; return <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} key={option.id} onClick={() => assign(option.id)}><span>{boxLabel(option.code)}</span><span className="text-[9px] text-white/45">{label}</span></button>; })}</div>}
    {message ? <span className="truncate text-[9px] text-red-300" title={message}>{message}</span> : null}
  </div>;
}

function RoutePlanner({ days, draft, events, onChange, initialRoutes, vehicles, staffOptions }: { days: string[]; draft: LogisticsRouteDraft | null; events: StaffLogisticsEvent[]; onChange: (draft: LogisticsRouteDraft | null) => void; initialRoutes: AdminLogisticsRoute[]; vehicles: LogisticsVehicleOption[]; staffOptions: LogisticsStaffOption[] }) {
  const [date, setDate] = useState(days[0] ?? "");
  const [type, setType] = useState<LogisticsRouteType>("FULL_DAY");
  const [vehicleId, setVehicleId] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (draft) return;
    const existing = initialRoutes.find((route) => route.date === date && route.type === type && route.status === "DRAFT");
    if (!existing) return;
    setVehicleId(existing.vehicleId);
    setStaffIds(existing.staffIds);
    onChange({ routeId: existing.id, date: existing.date, type: existing.type, status: existing.status, eventIds: existing.eventIds, vehicleId: existing.vehicleId, driverId: existing.driverId, staffIds: existing.staffIds });
  }, [date, draft, initialRoutes, onChange, type]);
  const routeEvents = draft ? draft.eventIds.map((id) => routeEventForProjectId(events, id)).filter((event): event is StaffLogisticsEvent => Boolean(event)) : [];
  const warnings = draft ? routeWarnings(events, draft.eventIds, draft.type) : [];
  const generate = () => { const eventIds = buildLogisticsRouteDraft(events, date, type); const selectedEvents = eventIds.map((id) => routeEventForProjectId(events, id)).filter((event): event is StaffLogisticsEvent => Boolean(event)); const automatic = automaticStaffIds(selectedEvents); setStaffIds(automatic); onChange({ date, type, status: "DRAFT", eventIds, vehicleId, driverId: "", staffIds: automatic }); };
  const move = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.eventIds.length) return;
    const ids = [...draft.eventIds];
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    onChange({ ...draft, eventIds: ids, status: draft.status === "PUBLISHED" ? "MODIFIED" : "DRAFT" });
  };
  const save = async () => { if (!draft || !draft.eventIds.length) return; const form = new FormData(); if (draft.routeId) form.set("routeId", draft.routeId); form.set("date", draft.date); form.set("routeType", draft.type); if (draft.vehicleId) form.set("vehicleId", draft.vehicleId); if (draft.driverId) form.set("driverId", draft.driverId); draft.eventIds.forEach((id) => form.append("eventIds", id)); draft.staffIds.forEach((id) => form.append("staffIds", id)); const result = await saveLogisticsRoutePlanAction(form); setMessage(result.ok ? result.message : result.error); if (result.ok) onChange({ ...draft, routeId: result.routeId, status: "ORDERED" }); };
  const saveAndPublish = async () => {
    if (!draft || !draft.eventIds.length || !draft.staffIds.length) return;
    const form = new FormData();
    if (draft.routeId) form.set("routeId", draft.routeId);
    form.set("date", draft.date);
    form.set("routeType", draft.type);
    if (draft.vehicleId) form.set("vehicleId", draft.vehicleId);
    if (draft.driverId) form.set("driverId", draft.driverId);
    draft.eventIds.forEach((id) => form.append("eventIds", id));
    draft.staffIds.forEach((id) => form.append("staffIds", id));
    const saved = await saveLogisticsRoutePlanAction(form);
    if (!saved.ok) { setMessage(saved.error); return; }
    const result = await publishLogisticsRouteAction(saved.routeId);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) onChange({ ...draft, routeId: saved.routeId, status: "PUBLISHED" });
  };
  const routeLabel = (value: LogisticsRouteType) => value === "ASSEMBLY" ? "MONTAJE" : value === "DISASSEMBLY" ? "DESMONTAJE" : "DÍA COMPLETO";
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4" aria-label="Planificador de rutas">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Rutas · publicación Staff</p><h3 className="mt-1 text-lg font-semibold text-white">Generar / ordenar ruta</h3><p className="mt-1 text-xs text-white/45">ORBIT detecta automáticamente Operador, Montaje y Desmontaje confirmados.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Día de ruta" className={selectClass} onChange={(event) => setDate(event.target.value)} value={date}>{days.map((day) => <option key={day} value={day}>{day}</option>)}</select><select aria-label="Tipo de ruta" className={selectClass} onChange={(event) => setType(event.target.value as LogisticsRouteType)} value={type}><option value="FULL_DAY">Staff</option></select><select aria-label="Vehículo opcional" className={selectClass} onChange={(event) => setVehicleId(event.target.value)} value={vehicleId}><option value="">Vehículo por confirmar</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select><button className="min-h-10 rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground" onClick={generate}>ORDENAR POR SECTOR Y HORA</button></div></div>
    {message ? <p className="mt-3 rounded-xl border border-brand/20 bg-brand/10 p-3 text-xs text-brand">{message}</p> : null}
    {draft ? <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">{routeLabel(draft.type)}</p><span className="rounded-full border border-brand/40 px-2 py-1 text-[10px] font-bold uppercase text-brand">{draft.status}</span></div>{routeEvents.length ? routeEvents.map((event, index) => <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#17181a] p-3" key={`${event.id}-${index}`}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{event.customer}</p><p className="truncate text-xs text-white/50">{event.commune} · {draft.type === "DISASSEMBLY" ? "Retiro" : "Montaje"} {formatTime(routeTarget(event, draft.type))}</p><p className="truncate text-[11px] text-white/45">{event.box === "Sin asignar" ? "⚠ FALTA CAJA" : event.box}</p></div><button aria-label="Subir evento" className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/55 hover:border-brand hover:text-brand" onClick={() => move(index, -1)}>↑</button><button aria-label="Bajar evento" className="grid size-8 place-items-center rounded-lg border border-white/10 text-white/55 hover:border-brand hover:text-brand" onClick={() => move(index, 1)}>↓</button></div>) : <p className="rounded-xl border border-white/10 p-4 text-sm text-white/45">No hay eventos para ese día.</p>}<div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">Staff automático</p><span className="text-[10px] font-semibold text-brand">{draft.staffIds.length} ASIGNADOS</span></div><div className="mt-2 flex flex-wrap gap-1.5">{staffOptions.filter((member) => draft.staffIds.includes(member.id)).map((member) => <span className="rounded-full border border-brand/30 px-2 py-1 text-xs text-brand" key={member.id}>{member.label}</span>)}</div><p className="mt-2 text-[11px] text-white/40">{draft.staffIds.length ? "Operador, Montaje y Desmontaje detectados desde los eventos." : "⚠ No hay Staff confirmado para los eventos de este día."}</p></div><div className="pt-1"><button className="min-h-11 w-full rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-40" disabled={!routeEvents.length || !draft.staffIds.length || draft.status === "PUBLISHED"} onClick={saveAndPublish}>ASIGNAR Y PUBLICAR</button></div></div><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">Advertencias</p>{warnings.length ? <ul className="mt-2 space-y-2 text-xs text-red-300">{warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-300">Sin conflictos evidentes en la propuesta.</p>}</div></div> : null}
    {initialRoutes.length ? <div className="mt-5 space-y-2 border-t border-white/10 pt-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-white/55">Rutas guardadas</p>{initialRoutes.filter((route) => days.includes(route.date)).map((route) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3" key={route.id}><span className="text-xs text-white/70">{routeLabel(route.type)} · {route.date} · {route.eventIds.length} paradas · <strong className="text-brand">{route.status}</strong> · {route.vehicleId ? "Vehículo asignado" : "Vehículo por confirmar"}</span><button className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/70" onClick={() => { setDate(route.date); setType(route.type); setVehicleId(route.vehicleId); setStaffIds(route.staffIds); onChange({ routeId: route.id, date: route.date, type: route.type, status: route.status, eventIds: route.eventIds, vehicleId: route.vehicleId, driverId: route.driverId, staffIds: route.staffIds }); }}>{route.status === "DRAFT" ? "EDITAR PROPUESTA" : "REVISAR"}</button></div>)}</div> : null}
  </section>;
}

function LogisticsDetail({ event, onClose, overrides, routeDraft }: { event: StaffLogisticsEvent; onClose: () => void; overrides: Record<string, LogisticsSector>; routeDraft: LogisticsRouteDraft | null }) {
  const state = statusView[normalizeStatus(event.status)];
  const locationHref = event.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}` : null;
  const setupOrder = routeDraft?.type === "ASSEMBLY" ? (routeDraft.eventIds.indexOf(event.projectId) + 1 || null) : null;
  const teardownOrder = routeDraft?.type === "DISASSEMBLY" ? (routeDraft.eventIds.indexOf(event.projectId) + 1 || null) : null;
  return <section className="rounded-2xl border border-brand/30 bg-[#111214] p-4 sm:p-5" aria-label="Detalle logístico del evento"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Detalle logístico del evento</p><h3 className="mt-1 text-xl font-semibold text-white">{event.customer}</h3><p className="mt-1 text-xs text-white/45">{event.orbitEventId} · {event.date} · {formatTime(event.time)} → {formatTime(event.endTime)}</p></div><button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 hover:border-brand hover:text-brand" onClick={onClose}><X className="size-4" />Cerrar</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Evento" value={`${event.service}${event.duration ? ` · ${event.duration} horas` : ""}`} /><DetailItem label="Staff" value={`${event.operator} · Citación ${formatTime(event.staffCallAt)}`} /><DetailItem label="Caja Negra / equipo" value={event.box} /><DetailItem label="Estado operativo" value={state.label} tone={state.color} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="COMUNA" value={event.commune} /><DetailItem label="SECTOR" value={sectorForCommune(event.commune, overrides)} /><DetailItem label="MONTAJE" value={`${formatTime(event.setupTime)} · ${event.setupStaff}`} /><DetailItem label="DESMONTAJE" value={`${formatTime(event.teardownTime)} · ${event.teardownStaff}`} /></div>{(setupOrder || teardownOrder) && <p className="mt-3 text-xs font-semibold text-brand">ROUTE ORDER · {setupOrder ? `Montaje #${setupOrder}` : `Desmontaje #${teardownOrder}`}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Logística / ruta</p><p className="mt-1 flex items-start gap-2 text-sm text-white/80"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{event.address || `${event.location} · ${event.commune}`}</p><p className="mt-2 text-xs text-white/45">Extras: {event.extras.length ? event.extras.join(" · ") : "Sin extras"}</p></div>{locationHref && <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground" href={locationHref} rel="noreferrer" target="_blank">Ver ubicación</a>}</div></section>;
}

function DetailItem({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) { return <div className="rounded-xl border border-white/10 bg-[#17181a] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/40">{label}</p><p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p></div>; }
function EmptyState() { return <div className="p-8 text-center text-sm text-white/45">No hay eventos que coincidan con la semana y filtros seleccionados.</div>; }
