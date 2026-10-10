"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MapPin, Phone, LayoutDashboard, UserRound, Camera, Users, Printer, Package, Wallet } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { updateEventPaperVariantAction, updateEventPrintInstructionsAction, type EventPhotoStyle, type PaperVariant } from "@/features/projects/event-paper.actions";
import type { CanonicalOperationalExtras, OperationalExtraCategory } from "@/features/operations/canonical-operational-extras";
import { EventBlackBoxPanel } from "@/features/asset-management/event-black-box-panel";
import { overrideStaffAssignmentPaymentAction, resetStaffAssignmentPaymentAction } from "@/features/staff-payments/actions";

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
  operationalExtras?: CanonicalOperationalExtras;
  postReservationExtras?: ReactNode;
  operationalContactName: string;
  operationalContactPhone: string;
  printInstructions: { photoStyle: EventPhotoStyle | null; operatorNote: string };
  operators: Array<{ role: string; name: string; callTime: string; staffId?: string }>;
  staffPayments?: Array<{ id: string; assignmentId?: string | null; staffId: string; staffName: string; role: string; blockId?: string | null; blockName?: string | null; blockStartAt?: string | null; blockEndAt?: string | null; baseAmount: number; finalAmount: number; overrideAmount: number | null; paid: number }>;
  paper: {
    opening: number | null;
    final: number | null;
    usage: number | null;
    reloads: number;
    format: string | null;
    variant: PaperVariant | null;
    status: string | null;
    boxCode?: string | null;
    confirmedBy?: string | null;
    confirmedAt?: string | null;
  } | null;
  invoice?: { invoiceNumber: string; outstandingBalance: number; status: string };
  equipment: string[];
  operationContent?: ReactNode;
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
type DetailKey = "overview" | "client" | "staff" | "service" | "paper" | "equipment" | "finance";
const DETAIL_KEYS: DetailKey[] = ["overview", "client", "staff", "service", "paper", "equipment", "finance"];

export function EventUiReplica({ projectId, customer, date, service, serviceDuration, serviceStartTime, serviceEndTime, staffCallTime, venue, municipality, status, eventType, extras, operationalExtras, postReservationExtras, operationalContactName, operationalContactPhone, printInstructions, operators, staffPayments = [], paper, invoice, equipment, operationContent }: Props) {
  const router = useRouter();
  const [paperMessage, setPaperMessage] = useState("");
  const [paperPending, startPaperTransition] = useTransition();
  const [printPending, startPrintTransition] = useTransition();
  const [printMessage, setPrintMessage] = useState("");
  const [photoStyle, setPhotoStyle] = useState<EventPhotoStyle | null>(printInstructions.photoStyle);
  const [operatorNote, setOperatorNote] = useState(printInstructions.operatorNote);
  const [operationOpen, setOperationOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState<Record<DetailKey, boolean>>({ overview: false, client: false, staff: false, service: false, paper: false, equipment: false, finance: false });
  const normalizedExtras = extras.map((item) => item.trim()).filter(Boolean);
  const contactName = display(operationalContactName, "Contacto operacional pendiente");
  const contactPhone = display(operationalContactPhone, "Teléfono pendiente");
  const hasPhone = Boolean(operationalContactPhone.trim());
  const serviceLabel = `${display(service, "Servicio BOOMBOX")}${serviceDuration ? ` · ${serviceDuration} horas` : ""}`;
  const timeRange = formatTimeRange(serviceStartTime, serviceEndTime, serviceDuration);
  const equipmentItems = ["Caja Negra", "Impresora", "Cámara", "Pantalla", ...equipment].filter((item, index, all) => item && all.indexOf(item) === index);
  const operationalExtraLabels: readonly OperationalExtraCategory[] = ["QR", "IMANES", "SCRAPBOOK", "FONDO", "TRASLADO", "OTROS"];
  const toggleDetail = (module: DetailKey) => setDetailOpen((current) => {
    const next = Object.fromEntries(DETAIL_KEYS.map((key) => [key, false])) as Record<DetailKey, boolean>;
    next[module] = !current[module];
    return next;
  });

  return <section className="mb-5 space-y-3 rounded-[24px] border border-white/10 bg-[#111214] p-3 text-white shadow-[0_20px_70px_rgba(0,0,0,.2)] sm:p-4">
    <div className="flex items-center justify-between gap-3 text-sm text-white/60"><Link href="/events" className="hover:text-brand">← Eventos</Link><span>Evento</span></div>
    <div className="rounded-2xl border border-brand/30 bg-[#191a1d] p-3 shadow-[0_0_35px_rgba(247,137,0,.08)] sm:p-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="grid size-[4.5rem] shrink-0 place-items-center rounded-xl bg-brand text-center text-black sm:size-20"><span className="text-[10px] uppercase tracking-[.16em]">{new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CL", { weekday: "short" })}</span><strong className="text-3xl leading-none">{date.slice(8, 10)}</strong><span className="text-[10px]">{date.slice(5, 7)}</span></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="text-xs text-white/55">{eventType}</p><span className="text-white/25">·</span><p className="text-xs font-semibold text-brand">{serviceLabel}</p></div><h1 className="mt-0.5 text-2xl font-semibold leading-tight sm:text-3xl">{customer}</h1><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-base font-semibold tracking-tight">{timeRange}</p><p className="text-xs text-white/65">Citación Staff: {staffCallTime ? `${staffCallTime} hrs` : "Por confirmar"}</p></div><span className="mt-1.5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">{status}</span></div>
      </div>
    </div>
    <nav aria-label="Menú principal EVENT 360°" className="rounded-2xl border border-brand/25 bg-[#0f1012] p-3">
      <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-brand">MENÚ PRINCIPAL · EVENT 360°</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {([
          ["overview","Resumen",LayoutDashboard],["client","Cliente",UserRound],["service","Servicio",Camera],
          ["staff","Staff",Users],["paper","Papel",Printer],["equipment","Equipos",Package],["finance","Cobranza",Wallet],
        ] as const).filter(([key])=>key!=="finance"||Boolean(invoice)).map(([key,label,Icon])=><button type="button" key={key} aria-pressed={Boolean(detailOpen[key])} onClick={()=>{setOperationOpen(true);toggleDetail(key);}} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold transition ${detailOpen[key]?"border-brand bg-brand/15 text-brand":"border-white/15 bg-[#191a1d] text-white hover:border-brand/60"}`}><Icon aria-hidden="true" className="size-5"/><span>{label}</span></button>)}
      </div>
    </nav>
    {postReservationExtras}
    <div className="event-detail-split-grid grid items-stretch gap-3 md:grid-cols-12 md:[&>*:nth-child(1)]:col-span-7 md:[&>*:nth-child(2)]:col-span-5 lg:grid-cols-12">
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-7"><ModuleHeading eyebrow="Evento" title="Lugar y contacto"/><div className="mt-2 grid gap-2 sm:grid-cols-2"><Info label="Lugar" value={display(venue)}/><Info label="Comuna" value={display(municipality)}/></div><div className="mt-2"><p className="text-[11px] uppercase tracking-[.16em] text-white/45">Extras operacionales</p>{operationalExtras ? <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">{operationalExtraLabels.map((category) => <div className="rounded-lg border border-white/10 px-2 py-1.5" key={category}><p className="text-[10px] uppercase tracking-[.1em] text-white/45">{category}</p><p className={`text-xs font-semibold ${operationalExtras.categories[category] ? "text-emerald-300" : "text-white/45"}`}>{operationalExtras.categories[category] ? "SÍ" : "NO"}</p>{operationalExtras.details[category]?.length ? <p className="mt-0.5 truncate text-[10px] text-white/60">{operationalExtras.details[category]!.join(" · ")}</p> : null}</div>)}</div> : <div className="mt-1.5 flex flex-wrap gap-1.5">{normalizedExtras.length ? normalizedExtras.map((item) => <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand" key={item}>{item}</span>) : <span className="text-xs text-white/60">SIN EXTRAS</span>}</div>}</div><div className="mt-2 rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[11px] uppercase tracking-[.16em] text-white/45">Encargado del evento</p><p className="mt-1 text-sm font-semibold">{contactName}</p><p className="text-xs text-white/65">{contactPhone}</p></div><div className="mt-2 flex flex-wrap gap-2"><a className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-3.5 text-xs font-semibold text-black" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, ${municipality}`)}`} rel="noreferrer" target="_blank"><MapPin className="size-3.5"/>VER UBICACIÓN</a>{hasPhone ? <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/40 px-3.5 text-xs font-semibold text-brand" href={phoneHref(operationalContactPhone)}><Phone className="size-3.5"/>CONTACTAR</a> : null}</div></div>
      <div className="rounded-2xl border border-brand/25 bg-[#241812] p-3 lg:col-span-12"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] uppercase tracking-[.16em] text-brand">Instrucciones de impresión</p><h2 className="mt-0.5 text-sm font-semibold">Configuración para el operador</h2></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${photoStyle ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>{photoStyle === "COLOR" ? "COLOR" : photoStyle === "BLACK_WHITE" ? "BLANCO Y NEGRO" : photoStyle === "SEPIA" ? "SEPIA" : "PENDIENTE"}</span></div><p className="mt-3 text-[10px] uppercase tracking-[.14em] text-white/45">Estilo de fotografía</p><div className="mt-2 flex flex-wrap gap-2">{([["COLOR","COLOR"],["BLACK_WHITE","BLANCO Y NEGRO"],["SEPIA","SEPIA"]] as const).map(([value,label]) => <button className={`min-h-9 rounded-lg border px-3 text-[11px] font-semibold transition ${photoStyle === value ? "border-brand bg-brand/15 text-brand" : "border-white/10 text-white/70 hover:border-brand/50"}`} disabled={printPending} key={value} onClick={() => { setPhotoStyle(value); startPrintTransition(async () => { try { await updateEventPrintInstructionsAction({ projectId, photoStyle: value, operatorNote }); setPrintMessage("Instrucción guardada y visible para el operador."); router.refresh(); } catch (error) { setPrintMessage(error instanceof Error ? error.message : "No fue posible guardar."); } }); }} type="button">{label}</button>)}</div><label className="mt-3 block"><span className="text-[10px] uppercase tracking-[.14em] text-white/45">Observación para operador</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-[#111214] p-3 text-sm text-white outline-none focus:border-brand/50" maxLength={500} onChange={(event) => setOperatorNote(event.target.value)} placeholder="Ej: Mantener todas las fotografías en blanco y negro." value={operatorNote}/></label><button className="mt-2 min-h-9 rounded-lg bg-brand px-3 text-[11px] font-semibold text-black disabled:opacity-50" disabled={printPending} onClick={() => startPrintTransition(async () => { try { await updateEventPrintInstructionsAction({ projectId, photoStyle, operatorNote }); setPrintMessage("Observación guardada y visible para el operador."); router.refresh(); } catch (error) { setPrintMessage(error instanceof Error ? error.message : "No fue posible guardar."); } })} type="button">{printPending ? "GUARDANDO…" : "GUARDAR OBSERVACIÓN"}</button>{printMessage ? <p className="mt-2 text-[10px] text-white/60">{printMessage}</p> : null}</div>
      <div className="rounded-2xl border border-brand/25 bg-[#241812] p-3 lg:col-span-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[.16em] text-brand">Papel / impresión</p><h2 className="mt-0.5 text-sm font-semibold">Resumen del evento</h2></div><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">{paper?.status ?? "PENDIENTE"}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><PaperMetric label="Papel ida" value={paper?.opening == null ? "PENDIENTE" : String(paper.opening)}/><PaperMetric label="Papel final evento" value={paper?.final == null ? "PENDIENTE" : String(paper.final)}/><PaperMetric label="Tipo de papel" value={paper?.variant === "NORMAL_4X6" ? "4x6 NORMAL" : paper?.variant === "PRECUT_4X6" ? "4x6 PREPICADO" : "PENDIENTE"}/><PaperMetric label="Impresiones utilizadas" value={paper?.usage == null ? "PENDIENTE" : String(paper.usage)}/></div>{paperMessage ? <p className="mt-1 text-[10px] text-white/60">{paperMessage}</p> : null}</div>
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-7"><ModuleHeading eyebrow="Operación" title="Staff y pagos del evento"/><div className="mt-2 grid gap-2 sm:grid-cols-2">{staffPayments.length ? staffPayments.map((payment) => <div className="rounded-xl border border-white/10 bg-white/[.02] px-2.5 py-2" key={`${payment.id}-${payment.role}`}><p className="text-[10px] uppercase tracking-[.14em] text-white/45">{roleLabel(payment.role)}{payment.blockName ? ` · ${payment.blockName}` : ""}</p><p className="mt-1 truncate text-xs font-semibold">{payment.staffName || "Sin asignar"}</p><p className="mt-1 text-[11px] text-white/55">{payment.blockStartAt && payment.blockEndAt ? `${new Date(payment.blockStartAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}–${new Date(payment.blockEndAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}` : operators.find((operator) => operator.staffId === payment.staffId && operator.role === payment.role)?.callTime ? `${operators.find((operator) => operator.staffId === payment.staffId && operator.role === payment.role)?.callTime} hrs` : "Horario por confirmar"}</p><EventPaymentAction payment={payment} role={payment.role}/></div>) : operators.map((operator) => <div className="rounded-xl border border-white/10 bg-white/[.02] px-2.5 py-2" key={operator.role}><p className="text-[10px] uppercase tracking-[.14em] text-white/45">{roleLabel(operator.role)}</p><p className="mt-1 truncate text-xs font-semibold">{operator.name || "Sin asignar"}</p><p className="mt-1 text-[11px] text-white/55">{operator.callTime ? `${operator.callTime} hrs` : "Sin citación"}</p></div>)}</div><div className="mt-2 grid grid-cols-4 gap-1 text-[10px]">{["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map((item) => <span className="rounded-full border border-white/10 px-1 py-1 text-center text-white/65" key={item}>{item}</span>)}</div></div>
      <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-3 lg:col-span-5"><ModuleHeading eyebrow="Operación" title="Caja Negra / equipamiento"/><div className="mt-2"><EventBlackBoxPanel projectId={projectId} /></div><div className="mt-2 grid grid-cols-2 gap-2">{equipmentItems.map((item) => <div className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/70" key={item}>{item}</div>)}</div><Link className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand/40 px-2.5 text-[11px] font-semibold text-brand" href={`/projects/${projectId}?experience=operations`}>VER EQUIPAMIENTO <ChevronRight className="size-3.5"/></Link></div>
    </div>
    {paper?.boxCode ? <section className="rounded-2xl border border-brand/25 bg-[#241812] p-3" aria-label="Historial de cierre de papel"><ModuleHeading eyebrow="Historial" title="Cierre de papel"/><p className="mt-2 text-xs text-white/70">{paper.boxCode} · Inicial {paper.opening ?? "—"} · Final {paper.final ?? "PENDIENTE"} · Consumido {paper.usage ?? "PENDIENTE"}</p>{paper.confirmedAt ? <p className="mt-1 text-[11px] text-white/55">Cerrado por {paper.confirmedBy ?? "Operador"} · {new Date(paper.confirmedAt).toLocaleString("es-CL")}</p> : null}</section> : null}
    {invoice ? <div className="max-w-2xl rounded-2xl border border-brand/25 bg-[#241812] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><ModuleHeading eyebrow="Cobranza" title="Saldo pendiente"/><p className="mt-1 text-lg font-semibold">{clp(invoice.outstandingBalance)}</p><p className="mt-1 text-xs text-white/55">Factura {invoice.invoiceNumber} · {invoice.status}</p></div><Link className="inline-flex min-h-10 items-center rounded-xl bg-brand px-3.5 text-xs font-semibold text-black" href={`/finance/receivables?project=${projectId}`}>COBRAR CLIENTE</Link></div></div> : null}
    {operationOpen && Object.values(detailOpen).some(Boolean) ? <div className="space-y-2 rounded-2xl border border-brand/25 bg-[#0f1012] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1"><p className="text-[11px] uppercase tracking-[.16em] text-brand">Event 360°</p><span className="text-xs text-white/50">Detalle completo</span></div>
      <div className="space-y-2">
        <AccordionSection eyebrow="00 · Resumen" title="Event 360° / Resumen general" summary={`${display(status, "Estado pendiente")} · ${date}`} open={detailOpen.overview} onToggle={() => toggleDetail("overview")}><div className="space-y-3"><div className="grid gap-2 sm:grid-cols-3"><Info label="Cliente" value={customer}/><Info label="Lugar" value={display(venue)}/><Info label="Comuna" value={display(municipality)}/></div>{operationContent ? <div className="overflow-hidden rounded-xl border border-white/10">{operationContent}</div> : null}</div></AccordionSection>
        <AccordionSection eyebrow="01 · Relación" title="Cliente" summary={customer} open={detailOpen.client} onToggle={() => toggleDetail("client")}><div className="grid gap-2 sm:grid-cols-3"><Info label="Cliente" value={customer}/><Info label="Tipo de evento" value={eventType}/><Info label="Contacto operacional" value={contactName}/></div></AccordionSection>
        <AccordionSection eyebrow="03 · Experiencia" title="Servicio contratado" summary={serviceLabel} open={detailOpen.service} onToggle={() => toggleDetail("service")}><div className="grid gap-2 sm:grid-cols-3"><Info label="Servicio" value={display(service)}/><Info label="Duración" value={serviceDuration ? `${serviceDuration} horas` : "Por confirmar"}/><Info label="Horario" value={timeRange}/></div></AccordionSection>
        <AccordionSection eyebrow="Staff" title="Operadores del evento" summary={`${operators.length} roles`} open={detailOpen.staff} onToggle={() => toggleDetail("staff")}><div className="grid gap-2 sm:grid-cols-3">{operators.map((operator) => <div className="rounded-xl border border-white/10 bg-white/[.02] px-2.5 py-2" key={operator.role}><p className="text-[10px] uppercase tracking-[.14em] text-white/45">{roleLabel(operator.role)}</p><p className="mt-1 truncate text-xs font-semibold">{operator.name || "Sin asignar"}</p><p className="mt-1 text-[11px] text-white/55">{operator.callTime ? `${operator.callTime} hrs` : "Sin citación"}</p></div>)}</div><div className="mt-2 grid grid-cols-4 gap-1 text-[10px]">{["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map((item) => <span className="rounded-full border border-white/10 px-1 py-1 text-center text-white/65" key={item}>{item}</span>)}</div></AccordionSection>
        <AccordionSection className="border-brand/25 bg-[#241812]" eyebrow="Papel / impresión" title="Resumen del evento" summary={paper?.status ?? "PENDIENTE"} open={detailOpen.paper} onToggle={() => toggleDetail("paper")}><div className="grid grid-cols-2 gap-2 text-xs"><PaperMetric label="Papel ida" value={paper?.opening == null ? "PENDIENTE" : String(paper.opening)}/><PaperMetric label="Papel final evento" value={paper?.final == null ? "PENDIENTE" : String(paper.final)}/><PaperMetric label="Tipo de papel" value={paper?.variant === "NORMAL_4X6" ? "4x6 NORMAL" : paper?.variant === "PRECUT_4X6" ? "4x6 PREPICADO" : "PENDIENTE"}/><PaperMetric label="Impresiones utilizadas" value={paper?.usage == null ? "PENDIENTE" : String(paper.usage)}/></div>{paper && !["CONFIRMED","OVERRIDDEN"].includes(paper.status ?? "") ? <div className="mt-3"><p className="text-[10px] uppercase tracking-[.14em] text-white/45">Definir tipo de papel</p><div className="mt-2 flex flex-wrap gap-2">{([["NORMAL_4X6","4x6 NORMAL"],["PRECUT_4X6","4x6 PREPICADO"]] as const).map(([variant,label]) => <button className={`min-h-9 rounded-lg border px-3 text-[11px] font-semibold transition ${paper.variant === variant ? "border-brand bg-brand/15 text-brand" : "border-white/10 text-white/70 hover:border-brand/50"}`} disabled={paperPending} key={variant} onClick={() => startPaperTransition(async () => { try { await updateEventPaperVariantAction({ projectId, variant }); setPaperMessage("Tipo de papel guardado."); router.refresh(); } catch (error) { setPaperMessage(error instanceof Error ? error.message : "No fue posible guardar el tipo de papel."); } })} type="button">{label}</button>)}</div></div> : null}{paperMessage ? <p className="mt-2 text-[10px] text-white/60">{paperMessage}</p> : null}</AccordionSection>
        <AccordionSection eyebrow="Operación" title="Caja Negra / equipamiento" summary={`${equipmentItems.length} elementos`} open={detailOpen.equipment} onToggle={() => toggleDetail("equipment")}><div className="grid grid-cols-2 gap-2">{equipmentItems.map((item) => <div className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/70" key={item}>{item}</div>)}</div><Link className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand/40 px-2.5 text-[11px] font-semibold text-brand" href={`/projects/${projectId}?experience=operations`}>VER EQUIPAMIENTO <ChevronRight className="size-3.5"/></Link></AccordionSection>
        {invoice ? <AccordionSection className="border-brand/25 bg-[#241812]" eyebrow="Finanzas" title="Cobranza" summary={`${clp(invoice.outstandingBalance)} · ${invoice.status}`} open={detailOpen.finance} onToggle={() => toggleDetail("finance")}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-semibold">{clp(invoice.outstandingBalance)}</p><p className="mt-1 text-xs text-white/55">Factura {invoice.invoiceNumber} · {invoice.status}</p></div><Link className="inline-flex min-h-10 items-center rounded-xl bg-brand px-3.5 text-xs font-semibold text-black" href={`/finance/receivables?project=${projectId}`}>COBRAR CLIENTE</Link></div></AccordionSection> : null}
      </div>
      <button className="flex min-h-10 w-full items-center justify-center rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/70 hover:border-brand/50 hover:text-brand" onClick={() => setDetailOpen({ overview: false, client: false, staff: false, service: false, paper: false, equipment: false, finance: false })} type="button">CERRAR DETALLE</button>
    </div> : null}
  </section>;
}

function EventPaymentAction({ payment, role }: { payment?: { id: string; assignmentId?: string | null; staffId: string; staffName: string; role: string; blockId?: string | null; blockName?: string | null; blockStartAt?: string | null; blockEndAt?: string | null; baseAmount: number; finalAmount: number; overrideAmount: number | null; paid: number }; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (!payment) return null;
  const paid = payment.paid > 0;
  const roleText = roleLabel(role);
  const openEditor = () => { setAmount(String(payment.finalAmount)); setReason(""); setMessage(""); setOpen(true); };
  const save = (reset: boolean) => startTransition(async () => {
    const data = new FormData();
    data.set("paymentId", payment.id);
    data.set("paymentRole", role);
    if (!reset) { data.set("paymentAmount", amount); data.set("paymentReason", reason); }
    const result = reset ? await resetStaffAssignmentPaymentAction(data) : await overrideStaffAssignmentPaymentAction(data);
    if (!result.ok) { setMessage(result.error ?? "No fue posible actualizar el pago."); return; }
    setOpen(false); setMessage(""); router.refresh();
  });
  return <div className="mt-2 rounded-lg border border-brand/20 bg-brand/5 p-2"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[.12em] text-white/45">Pago</p><p className="text-xs font-semibold">{new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(payment.finalAmount)}{payment.overrideAmount !== null ? <span className="ml-1 text-[9px] uppercase text-brand">Personalizado</span> : null}</p></div>{paid ? <span className="text-[9px] font-semibold text-white/50">PAGADO · BLOQUEADO</span> : <button type="button" className="rounded-md border border-brand/40 px-2 py-1 text-[10px] font-semibold text-brand" onClick={openEditor}>EDITAR PAGO</button>}</div>{open ? <div className="mt-2 space-y-2 border-t border-white/10 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-brand">Editar pago — {roleText}</p><p className="text-[10px] text-white/60">{payment.staffName} · Base {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(payment.baseAmount)}</p><input aria-label={`Pago acordado ${roleText}`} className="min-h-9 w-full rounded-md border border-white/15 bg-[#111214] px-2 text-xs" inputMode="numeric" min="0" onChange={(event) => setAmount(event.target.value)} type="number" value={amount}/><input aria-label="Motivo del pago personalizado" className="min-h-9 w-full rounded-md border border-white/15 bg-[#111214] px-2 text-xs" onChange={(event) => setReason(event.target.value)} placeholder="Motivo obligatorio" value={reason}/><div className="flex flex-wrap gap-2"><button type="button" className="rounded-md bg-brand px-2.5 py-1.5 text-[10px] font-bold text-black disabled:opacity-50" disabled={pending || !reason.trim()} onClick={() => save(false)}>GUARDAR</button>{payment.overrideAmount !== null ? <button type="button" className="rounded-md border border-white/15 px-2.5 py-1.5 text-[10px] font-semibold" disabled={pending} onClick={() => save(true)}>RESTABLECER</button> : null}<button type="button" className="rounded-md border border-white/15 px-2.5 py-1.5 text-[10px]" disabled={pending} onClick={() => setOpen(false)}>CANCELAR</button></div>{message ? <p className="text-[10px] text-danger">{message}</p> : null}</div> : null}</div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[10px] text-white/45">{label}</p><p className="mt-0.5 truncate text-xs font-semibold">{value}</p></div>; }
function PaperMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 px-2.5 py-2"><p className="text-[10px] uppercase tracking-[.1em] text-white/45">{label}</p><p className="mt-0.5 text-xs font-semibold text-white/90">{value}</p></div>; }
function ModuleHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <><p className="text-[11px] uppercase tracking-[.16em] text-brand">{eyebrow}</p><h2 className="mt-0.5 text-sm font-semibold uppercase">{title}</h2></>; }
function AccordionSection({ className = "", eyebrow, title, summary, open, onToggle, children }: { className?: string; eyebrow: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) { return <section className={`rounded-xl border border-white/10 bg-[#191a1d] p-3 ${className}`}><button aria-expanded={open} className="flex min-h-10 w-full items-center justify-between gap-3 text-left" onClick={onToggle} type="button"><span className="min-w-0"><span className="block text-[10px] uppercase tracking-[.16em] text-brand">{eyebrow}</span><span className="mt-0.5 block truncate text-sm font-semibold uppercase">{title}</span></span><span className="flex shrink-0 items-center gap-2 text-right text-[11px] text-white/50"><span className="max-w-[12rem] truncate">{summary}</span><ChevronRight aria-hidden="true" className={`size-4 text-brand transition-transform ${open ? "rotate-90" : ""}`}/></span></button>{open ? <div className="mt-3">{children}</div> : null}</section>; }
