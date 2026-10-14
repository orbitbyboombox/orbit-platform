"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateBlackBoxMasterAction } from "./black-box-master.actions";
import { assignBlackBoxToEventAction, getBlackBoxAvailabilityForEventAction, removeBlackBoxFromEventAction } from "@/features/asset-management/event-black-box.actions";
import { BLACK_BOX_PAPER_FORMATS, blackBoxNumber, blackBoxPaperFormat, blackBoxStock, type BoxAsset } from "./box-inventory";

const statusOptions = [
  ["AVAILABLE", "Disponible"],
  ["ASSIGNED", "Asignada"],
  ["MAINTENANCE", "Mantención"],
  ["OUT_OF_SERVICE", "Fuera de servicio"],
] as const;

type BoxEventOption = { id: string; name: string; date: string; time: string; service: string };

export function BlackBoxMaster({ initialBoxes, events }: { initialBoxes: BoxAsset[]; events: BoxEventOption[] }) {
  const [boxes, setBoxes] = useState(initialBoxes);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (box: BoxAsset, formData: FormData) => {
    setError("");
    startTransition(async () => {
      const result = await updateBlackBoxMasterAction(formData);
      if (!result.ok) return setError(result.error);
      const photoStock = Number(formData.get("photoStock"));
      const paperFormat = String(formData.get("paperFormat"));
      const status = String(formData.get("status"));
      setBoxes((current) => current.map((item) => item.id === box.id ? {
        ...item,
        status,
        updated_by: "current-user",
        updated_by_name: "Usuario actual",
        updated_at: new Date().toISOString(),
        version: item.version + 1,
        metadata: { ...item.metadata, blackBoxPhotoStock: photoStock, blackBoxPaperFormat: paperFormat },
      } : item));
      setEditing(null);
    });
  };

  return <section className="space-y-5" aria-labelledby="black-box-master-title">
    <header className="rounded-2xl border bg-card px-5 py-6 sm:px-7">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">MASTER ADMIN · INVENTARIO</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h1 id="black-box-master-title" className="text-3xl font-semibold">Cajas Negras</h1><p className="mt-2 max-w-2xl text-sm text-muted">Stock oficial de fotos y papel por Caja. Los cambios quedan persistidos y auditados.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">9 cajas operativas</span>
          <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground" onClick={() => { setError(""); setAssignmentOpen(true); }}>+ ASIGNAR CAJA A EVENTO</button>
        </div>
      </div>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {boxes.map((box) => <BlackBoxCard key={box.id} box={box} events={events} editing={editing === box.id} pending={pending} onEdit={() => { setError(""); setEditing(box.id); }} onCancel={() => { setError(""); setEditing(null); }} onSave={(data) => save(box, data)} onAssigned={() => location.reload()} />)}
    </div>
    {assignmentOpen ? <AssignBoxToEventDialog boxes={boxes} events={events} onClose={() => setAssignmentOpen(false)} onAssigned={() => location.reload()} /> : null}
  </section>;
}

function AssignBoxToEventDialog({ boxes, events, onClose, onAssigned }: { boxes: BoxAsset[]; events: BoxEventOption[]; onClose: () => void; onAssigned: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, startSaving] = useTransition();
  const selectedEvent = events.find((event) => event.id === projectId);
  useEffect(() => {
    if (!projectId) {
      setAvailability({});
      return;
    }
    let active = true;
    setLoading(true);
    void getBlackBoxAvailabilityForEventAction(projectId).then((result) => {
      if (!active) return;
      if (!result.ok) setMessage(result.error);
      else setAvailability(Object.fromEntries(result.assets.map((asset) => [asset.id, Boolean(asset.conflicts)])));
      setLoading(false);
    });
    return () => { active = false; };
  }, [projectId]);
  const selectedBox = boxes.find((box) => box.id === assetId);
  const blocked = Boolean(assetId && availability[assetId]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="assign-box-title">
    <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-2xl sm:rounded-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">MASTER ADMIN · CAJAS</p><h2 id="assign-box-title" className="mt-1 text-2xl font-semibold">ASIGNAR CAJA A EVENTO</h2><p className="mt-2 text-sm text-muted">La asignación reserva la Caja para la ventana operacional. No descuenta papel del Master.</p></div><button type="button" aria-label="Cerrar" className="rounded-lg border p-2" onClick={onClose}><X className="size-4"/></button></div>
      <label className="mt-6 grid gap-2 text-sm font-semibold">EVENTO<select className="min-h-11 rounded-xl border bg-background px-3 font-normal" value={projectId} onChange={(event) => { setProjectId(event.target.value); setAssetId(""); setMessage(""); }}><option value="">Buscar / seleccionar evento</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.date} · {event.time?.slice(0, 5) ?? "--:--"}{event.service ? " · " + event.service : ""}</option>)}</select>{selectedEvent ? <span className="text-xs font-normal text-muted">{selectedEvent.name} · {selectedEvent.date} · {selectedEvent.time?.slice(0, 5) ?? "Horario pendiente"} · {selectedEvent.service || "Servicio pendiente"}</span> : null}</label>
      <label className="mt-4 grid gap-2 text-sm font-semibold">CAJA<select className="min-h-11 rounded-xl border bg-background px-3 font-normal" value={assetId} onChange={(event) => setAssetId(event.target.value)} disabled={!projectId || loading}><option value="">{loading ? "Consultando disponibilidad…" : "Seleccionar caja"}</option>{boxes.map((box) => { const conflict = availability[box.id]; const label = "Caja " + blackBoxNumber(box.asset_code) + " · " + blackBoxStock(box.metadata) + " fotos · " + (conflict ? "Ocupada en este horario" : box.status === "OUT_OF_SERVICE" ? "Fuera de servicio" : box.status === "MAINTENANCE" ? "Mantención" : "Disponible"); return <option key={box.id} value={box.id} disabled={Boolean(conflict) || box.status === "OUT_OF_SERVICE" || box.status === "MAINTENANCE"}>{label}</option>; })}</select></label>
      {selectedBox ? <p className="mt-2 text-xs text-muted">Caja {blackBoxNumber(selectedBox.asset_code)} · {blackBoxStock(selectedBox.metadata)} fotos disponibles · {blocked ? "No disponible para esta ventana" : "Disponible para esta ventana"}</p> : null}
      {message ? <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">{message}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={onClose}>Cancelar</button><button type="button" disabled={saving || !projectId || !assetId || blocked} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50" onClick={() => startSaving(async () => { const result = await assignBlackBoxToEventAction({ projectId, assetId, reason: "Asignación directa desde Master Cajas" }); if (!result.ok) { setMessage(result.error); return; } onAssigned(); })}>{saving ? "Asignando…" : "CONFIRMAR ASIGNACIÓN"}</button></div>
    </div>
  </div>;
}

function BlackBoxCard({ box, events, editing, pending, onEdit, onCancel, onSave, onAssigned }: { box: BoxAsset; events: BoxEventOption[]; editing: boolean; pending: boolean; onEdit: () => void; onCancel: () => void; onSave: (formData: FormData) => void; onAssigned: () => void }) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assigning, startAssigning] = useTransition();
  const number = blackBoxNumber(box.asset_code);
  const stock = blackBoxStock(box.metadata);
  const format = blackBoxPaperFormat(box.metadata);
  const status = statusOptions.find(([value]) => value === box.status)?.[1] ?? box.status;
  return <article className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{box.asset_code}</p><h2 className="mt-1 text-xl font-semibold">Caja {number}</h2></div>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${box.status === "AVAILABLE" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-amber-500/30 bg-amber-500/10 text-amber-600"}`}>{status}</span>
    </div>
    {!editing ? <>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border bg-background/40 p-3"><p className="text-[11px] uppercase tracking-wide text-muted">Fotos disponibles</p><p className="mt-1 text-2xl font-semibold">{stock}</p></div><div className="rounded-xl border bg-background/40 p-3"><p className="text-[11px] uppercase tracking-wide text-muted">Papel</p><p className="mt-1 text-sm font-semibold">{format === "4X6_PREPICADO" ? "4x6 PREPICADO" : "4x6"}</p></div></div>
      <div className="mt-4 rounded-xl border bg-background/40 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Eventos asignados</p>{box.assignments.length ? <div className="mt-2 space-y-2">{box.assignments.map((assignment) => <div className="text-sm" key={assignment.id}><p className="font-semibold">{assignment.eventName}</p><p className="text-muted">{assignment.eventDate} · {assignment.eventTime?.slice(0, 5) || "Horario pendiente"}</p></div>)}</div> : <p className="mt-2 text-sm text-muted">Sin Evento asignado</p>}<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select aria-label={`Asignar ${box.asset_code} a Evento`} className="min-h-10 rounded-lg border bg-background px-2 text-sm" disabled={assigning || box.status === "MAINTENANCE" || box.status === "OUT_OF_SERVICE"} onChange={(event) => setSelectedProjectId(event.target.value)} value={selectedProjectId}><option value="">Seleccionar Evento</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.date}</option>)}</select><button type="button" disabled={assigning || !selectedProjectId || box.status === "MAINTENANCE" || box.status === "OUT_OF_SERVICE"} className="min-h-10 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground" onClick={() => startAssigning(async () => { const result = await assignBlackBoxToEventAction({ projectId: selectedProjectId, assetId: box.id, reason: `Asignación desde Master Cajas · ${box.asset_code}` }); setAssignmentMessage(result.ok ? "Caja asignada al Evento. El stock no fue descontado." : result.error ?? "No fue posible asignar la Caja."); if (result.ok) onAssigned(); })}>ASIGNAR A EVENTO</button></div>{assignmentMessage ? <p aria-live="polite" className="mt-2 text-xs font-medium">{assignmentMessage}</p> : null}</div>
      <p className="mt-4 text-xs text-muted">Actualizada {new Date(box.updated_at).toLocaleString("es-CL")} · {box.updated_by_name ?? "Sistema"}</p>
     <button type="button" onClick={onEdit} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold hover:border-brand hover:text-brand"><Pencil className="size-4" />Editar stock</button>
      {box.assignments.length ? <div className="mt-3 flex flex-wrap gap-2">{box.assignments.map((assignment) => <div className="flex gap-2" key={"actions-" + assignment.id}><a className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold" href={"/projects/" + assignment.projectId + "#equipment-assignment"}>VER EVENTO</a><button type="button" className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-600" disabled={assigning} onClick={() => startAssigning(async () => { const result = await removeBlackBoxFromEventAction({ projectId: assignment.projectId, reason: "Liberación desde Master Cajas · " + box.asset_code }); setAssignmentMessage(result.ok ? "Caja liberada." : result.error ?? "No fue posible liberar la Caja."); if (result.ok) onAssigned(); })}>LIBERAR</button></div>)}</div> : null}
    </> : <form className="mt-4 space-y-3" action={onSave}>
      <input type="hidden" name="id" value={box.id}/><input type="hidden" name="assetCode" value={box.asset_code}/><input type="hidden" name="version" value={box.version}/>
      <label className="block text-xs font-semibold text-muted">Fotos disponibles<input name="photoStock" type="number" min="0" step="1" defaultValue={stock} required className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"/></label>
      <label className="block text-xs font-semibold text-muted">Formato de papel<select name="paperFormat" defaultValue={format} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">{BLACK_BOX_PAPER_FORMATS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="block text-xs font-semibold text-muted">Estado<select name="status" defaultValue={box.status} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="flex gap-2 pt-1"><button disabled={pending} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground"><Check className="size-4"/>{pending ? "Guardando..." : "Guardar"}</button><button disabled={pending} type="button" onClick={onCancel} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold"><X className="size-4"/>Cancelar</button></div>
    </form>}
  </article>;
}
