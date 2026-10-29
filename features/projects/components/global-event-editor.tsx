"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  loadGlobalEventEditorAction,
  updateGlobalEventEditorAction,
  type GlobalEventItem,
  type GlobalEventService,
} from "../actions/global-event-editor.actions";
import { calculateGlobalEventTotals } from "./global-event-editor.logic";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(value));
export function GlobalEventEditor({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadGlobalEventEditorAction>> | null>(null);
  const [project, setProject] = useState({ name: "", eventDate: "", eventTime: "", location: "", city: "", eventAddress: "", notes: "" });
  const [services, setServices] = useState<(GlobalEventService & { removed?: boolean })[]>([]);
  const [schedule, setSchedule] = useState({ serviceStartLocal: "", serviceEndLocal: "", staffCallLocal: "" });
  const [items, setItems] = useState<GlobalEventItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [transport, setTransport] = useState(0);
  const [vatPercent, setVatPercent] = useState(19);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    loadGlobalEventEditorAction(projectId).then((data) => {
      if (!active) return;
      setLoaded(data);
      setProject(data.project);
      setServices(data.services);
      setSchedule(data.schedule);
      setItems(data.quotation?.items ?? []);
      setDiscount(data.quotation?.discount ?? 0);
      setTransport(data.quotation?.transport ?? 0);
      const net = Math.max(0, (data.quotation?.subtotal ?? 0) - (data.quotation?.discount ?? 0) + (data.quotation?.transport ?? 0));
      setVatPercent(net ? Math.round((data.quotation?.tax ?? 0) / net * 10000) / 100 : 19);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "No fue posible cargar el editor."); });
    return () => { active = false; };
  }, [projectId]);

  const paid = loaded?.invoice?.paid ?? 0;
  const totals = useMemo(() => calculateGlobalEventTotals({ items, discount, transport, vatPercent, paid }), [discount, items, paid, transport, vatPercent]);
  const updateProject = (key: keyof typeof project, value: string) => setProject((current) => ({ ...current, [key]: value }));
  const save = () => startTransition(async () => {
    if (!loaded) return;
    if (!reason.trim()) { setMessage("Indica el motivo del cambio."); return; }
    const result = await updateGlobalEventEditorAction({
      projectId, expectedVersion: loaded.project.version, reason, project,
      services,
      schedule,
      quotation: loaded.quotation ? { items, discount, transport, vatPercent } : undefined,
    });
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) setLoaded((current) => current ? { ...current, project: { ...current.project, version: Number(result.data?.version ?? current.project.version + 1) } } : current);
  });

  return <section aria-label="Editor global de eventos" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
    <div><h3 className="text-lg font-semibold">Editar evento completo</h3><p className="text-sm text-muted">Mantiene el ID, la cotización original, los pagos históricos y la trazabilidad. Las sincronizaciones se ejecutan después del guardado atómico.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {([['name', 'Nombre del evento'], ['eventDate', 'Fecha'], ['eventTime', 'Hora'], ['location', 'Lugar'], ['city', 'Comuna'], ['eventAddress', 'Dirección completa']] as const).map(([key, label]) => <label className="text-sm" key={key}><span className="mb-1 block text-muted">{label}</span><input className="h-11 w-full rounded-xl border bg-background px-3" type={key === 'eventDate' ? 'date' : key === 'eventTime' ? 'time' : 'text'} value={project[key]} onChange={(event) => updateProject(key, event.target.value)} /></label>)}
      <label className="text-sm sm:col-span-2"><span className="mb-1 block text-muted">Observaciones</span><textarea className="min-h-20 w-full rounded-xl border bg-background p-3" value={project.notes} onChange={(event) => updateProject('notes', event.target.value)} /></label>
    </div>

    <div className="space-y-3 rounded-xl border p-3"><h4 className="font-semibold">Horarios operativos</h4><div className="grid gap-3 sm:grid-cols-3">
      {([['serviceStartLocal', 'Inicio del servicio'], ['serviceEndLocal', 'Término del servicio'], ['staffCallLocal', 'Hora de citación']] as const).map(([key, label]) => <label className="text-sm" key={key}><span className="mb-1 block text-muted">{label}</span><input className="h-11 w-full rounded-xl border bg-background px-3" type="datetime-local" value={schedule[key]?.slice(0, 16) ?? ""} onChange={(event) => setSchedule((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
    </div></div>

    <div className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Servicios contratados</h4><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setServices((rows) => [...rows, { id: "", code: "", duration: 2, extras: [] }])}>+ Agregar servicio</button></div>
      {services.map((service, index) => service.removed ? <div className="flex items-center justify-between rounded-lg border border-dashed p-3 text-sm text-muted" key={service.id || index}>Se eliminará: {service.code || "Servicio sin código"}<button type="button" className="text-brand" onClick={() => setServices((rows) => rows.map((row) => row === service ? { ...row, removed: false } : row))}>Restaurar</button></div> : <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12" key={service.id || index}><label className="text-sm sm:col-span-5">Servicio<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={service.code} onChange={(event) => setServices((rows) => rows.map((row) => row === service ? { ...row, code: event.target.value } : row))} /></label><label className="text-sm sm:col-span-2">Horas<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0.25" max="24" step="0.25" value={service.duration} onChange={(event) => setServices((rows) => rows.map((row) => row === service ? { ...row, duration: Number(event.target.value) } : row))} /></label><label className="text-sm sm:col-span-4">Extras<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={service.extras.join(", ")} onChange={(event) => setServices((rows) => rows.map((row) => row === service ? { ...row, extras: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } : row))} /></label><button type="button" className="self-end rounded-lg border px-2 py-2 text-sm" onClick={() => setServices((rows) => rows.map((row) => row === service ? { ...row, removed: true } : row))}>Quitar</button></div>)}
    </div>

    {loaded?.quotation && <div className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Precios, descuentos y extras</h4><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setItems((rows) => [...rows, { itemType: "EXTRA", code: "", label: "", quantity: 1, unitPrice: 0, discount: 0 }])}>+ Agregar partida</button></div>{items.map((item, index) => <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12" key={item.id || index}><label className="text-sm sm:col-span-2">Tipo<select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={item.itemType} onChange={(event) => setItems((rows) => rows.map((row) => row === item ? { ...row, itemType: event.target.value as GlobalEventItem['itemType'] } : row))}><option value="SERVICE">Servicio</option><option value="EXTRA">Extra</option><option value="TRANSPORT">Traslado</option></select></label><label className="text-sm sm:col-span-4">Descripción<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={item.label} onChange={(event) => setItems((rows) => rows.map((row) => row === item ? { ...row, label: event.target.value } : row))} /></label><label className="text-sm sm:col-span-2">Cantidad<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => setItems((rows) => rows.map((row) => row === item ? { ...row, quantity: Number(event.target.value) } : row))} /></label><label className="text-sm sm:col-span-3">Precio unitario<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0" step="1" value={item.unitPrice} onChange={(event) => setItems((rows) => rows.map((row) => row === item ? { ...row, unitPrice: Number(event.target.value) } : row))} /></label><button type="button" className="self-end rounded-lg border px-2 py-2 text-sm" disabled={items.length === 1} onClick={() => setItems((rows) => rows.filter((row) => row !== item))}>Quitar</button></div>)}<div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Descuento<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><label className="text-sm">Traslado<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0" value={transport} onChange={(event) => setTransport(Number(event.target.value))} /></label><label className="text-sm">IVA %<input className="mt-1 h-10 w-full rounded-lg border bg-background px-2" type="number" min="0" max="100" step="0.01" value={vatPercent} onChange={(event) => setVatPercent(Number(event.target.value))} /></label></div><div className="rounded-lg bg-background/60 p-3 text-sm"><p>Subtotal: {money(totals.subtotal)} · IVA: {money(totals.tax)}</p><p className="font-semibold">Total: {money(totals.total)} · Abonos históricos: {money(totals.paid)} · Saldo: {money(totals.balance)}</p>{loaded.invoice?.closed && <p className="mt-1 text-xs text-muted">La factura está cerrada; no podrás cambiar un total que la altere.</p>}</div></div>}

    <label className="block text-sm"><span className="mb-1 block text-muted">Motivo obligatorio y auditoría</span><textarea className="min-h-20 w-full rounded-xl border bg-background p-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej.: Corrección operacional confirmada por Founder" /></label>
    <button type="button" className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-50" disabled={pending || !loaded || !reason.trim() || !project.name.trim() || !project.eventDate || !project.eventTime || !project.location.trim() || !project.city.trim()} onClick={save}>{pending ? "Guardando cambios…" : "Guardar evento completo"}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
