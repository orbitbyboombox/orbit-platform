"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Package, UserRound } from "lucide-react";
import { updateEventOperationalContractAction } from "./event-operational-contract.actions";

export type OperationalReadinessData = {
  projectId: string;
  status: "PREPARATION" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CLOSED";
  readiness: "READY" | "NOT_READY";
  reasons: readonly { code: string; label: string; href?: string }[];
  contact: { status: "PENDING" | "CONFIRMED"; firstName: string; lastName: string; phone: string; email: string; role: string; notes: string; fallbackLabel?: string };
  schedules: { staffArrivalAt: string; assemblyStartAt: string; serviceStartAt: string; serviceEndAt: string; disassemblyStartAt: string; operationalEndAt: string };
  accessInstructions: string;
  operationalNotes: string;
  requirements: readonly { id: string; code: string; label: string; type: string; required: number; assigned: number }[];
  staff: readonly { role: string; name: string; status: string }[];
  checklist: { completed: number; required: number };
};

const local = (value: string) => value ? new Date(value).toLocaleString("sv-SE", { timeZone: "America/Santiago" }).replace(" ", "T").slice(0, 16) : "";
const statusLabel: Record<OperationalReadinessData["status"], string> = { PREPARATION: "EN PREPARACIÓN", READY: "OPERACIÓN LISTA", IN_PROGRESS: "EN EJECUCIÓN", COMPLETED: "EVENTO COMPLETADO", CLOSED: "CERRADO" };
const roleLabel: Record<string, string> = { OPERATOR: "Operador", ASSEMBLY: "Montaje", DISASSEMBLY: "Desmontaje" };

export function EventOperationalReadiness({ data }: { data: OperationalReadinessData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState("");
  const save = (form: FormData) => start(async () => {
    const result = await updateEventOperationalContractAction(form);
    setFeedback(result.ok ? result.message : result.error);
    if (result.ok) { setEditing(false); router.refresh(); }
  });
  const physical = data.requirements.filter((item) => item.type === "PHYSICAL_UNIT");
  const supporting = data.requirements.filter((item) => item.type !== "PHYSICAL_UNIT");
  return <section className="scroll-mt-24 rounded-2xl border bg-card p-4 sm:p-6" id="operations-readiness">
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand">Operations 1.0</p><h2 className="mt-1 text-2xl font-semibold">Operación</h2><p className="mt-2 text-sm text-muted">Contrato operacional canónico del Evento.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${data.readiness === "READY" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{statusLabel[data.status]}</span><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={() => setEditing((value) => !value)}>{editing ? "Cerrar" : "Editar operación"}</button></div>
    </header>
    {data.readiness === "READY" ? <div className="mt-5 flex gap-3 rounded-xl border border-success/25 bg-success/5 p-4"><CheckCircle2 className="size-5 shrink-0 text-success"/><div><p className="font-semibold">Operación lista</p><p className="text-sm text-muted">Todos los requisitos críticos disponibles están completos.</p></div></div> : <div className="mt-5 rounded-xl border border-warning/30 bg-warning/5 p-4"><div className="flex gap-3"><AlertTriangle className="size-5 shrink-0 text-warning"/><div><p className="font-semibold">{data.reasons.length} pendientes críticos</p><p className="text-sm text-muted">Resuelve estos puntos antes de operar el Evento.</p></div></div><ul className="mt-3 space-y-2">{data.reasons.map((reason) => <li className="text-sm" key={reason.code}>• {reason.label}</li>)}</ul></div>}
    {editing ? <form action={save} className="mt-6 grid gap-4 rounded-2xl border bg-background/30 p-4 sm:grid-cols-2">
      <input name="projectId" type="hidden" value={data.projectId}/>
      <Field defaultValue={data.contact.firstName} label="Nombre contacto en terreno" name="contactFirstName" required/>
      <Field defaultValue={data.contact.lastName} label="Apellido" name="contactLastName"/>
      <Field defaultValue={data.contact.phone} label="Teléfono" name="contactPhone" required/>
      <Field defaultValue={data.contact.email} label="Email" name="contactEmail" type="email"/>
      <Field defaultValue={data.contact.role} label="Cargo / rol" name="contactRole"/>
      <Field defaultValue={data.contact.notes} label="Notas del contacto" name="contactNotes"/>
      <Field defaultValue={local(data.schedules.staffArrivalAt)} label="Llegada Staff" name="staffArrivalAt" type="datetime-local"/>
      <Field defaultValue={local(data.schedules.assemblyStartAt)} label="Inicio montaje" name="assemblyStartAt" type="datetime-local"/>
      <Field defaultValue={local(data.schedules.serviceStartAt)} label="Inicio servicio" name="serviceStartAt" type="datetime-local"/>
      <Field defaultValue={local(data.schedules.serviceEndAt)} label="Fin servicio" name="serviceEndAt" type="datetime-local"/>
      <Field defaultValue={local(data.schedules.disassemblyStartAt)} label="Inicio desmontaje" name="disassemblyStartAt" type="datetime-local"/>
      <Field defaultValue={local(data.schedules.operationalEndAt)} label="Término operacional" name="operationalEndAt" type="datetime-local"/>
      <label className="grid gap-2 text-sm sm:col-span-2">Instrucciones de acceso<textarea className="min-h-24 rounded-xl border bg-background p-3" defaultValue={data.accessInstructions} name="accessInstructions"/></label>
      <label className="grid gap-2 text-sm sm:col-span-2">Notas operacionales<textarea className="min-h-24 rounded-xl border bg-background p-3" defaultValue={data.operationalNotes} name="operationalNotes"/></label>
      <button className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground sm:col-span-2" disabled={pending}>{pending ? "Guardando…" : "Guardar y recalcular"}</button>
    </form> : null}
    {feedback ? <p className="mt-3 text-sm" role="status">{feedback}</p> : null}
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card icon={<UserRound className="size-4"/>} title="Contacto en terreno"><Value label="Estado" value={data.contact.status === "CONFIRMED" ? "Confirmado" : "PENDIENTE DE CONFIRMAR"}/><Value label="Nombre" value={[data.contact.firstName, data.contact.lastName].filter(Boolean).join(" ") || data.contact.fallbackLabel || "Sin contacto"}/><Value label="Teléfono" value={data.contact.phone || "Por confirmar"}/><Value label="Rol" value={data.contact.role || "Por confirmar"}/></Card>
      <Card icon={<Clock3 className="size-4"/>} title="Horarios operacionales">{Object.entries({"Llegada Staff":data.schedules.staffArrivalAt,"Montaje":data.schedules.assemblyStartAt,"Inicio servicio":data.schedules.serviceStartAt,"Fin servicio":data.schedules.serviceEndAt,"Desmontaje":data.schedules.disassemblyStartAt,"Término operacional":data.schedules.operationalEndAt}).map(([label, value]) => <Value key={label} label={label} value={value ? new Date(value).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }) : "Pendiente"}/>)}</Card>
      <Card icon={<Package className="size-4"/>} title="Servicios y necesidades">{physical.map((item) => <Value key={item.id} label={item.label} value={`${item.required} requeridos · ${item.assigned} asignados`}/>)}{supporting.map((item) => <Value key={item.id} label={item.label} value={`${item.required} · ${item.type === "CONSUMABLE" ? "Insumo" : item.type === "TRANSPORT" ? "Traslado" : "No físico"}`}/>)}{!data.requirements.length ? <p className="text-sm text-muted">Sin necesidades definidas.</p> : null}</Card>
      <Card icon={<CheckCircle2 className="size-4"/>} title="Ejecución"><Value label="Checklist" value={`${data.checklist.completed}/${data.checklist.required} críticos`}/>{data.staff.map((item) => <Value key={`${item.role}-${item.name}`} label={roleLabel[item.role] ?? item.role} value={`${item.name} · ${item.status}`}/>)}{!data.staff.length ? <Value label="Staff" value="Pendiente"/> : null}</Card>
    </div>
  </section>;
}

function Field({ label, name, defaultValue, type = "text", required = false }: { label: string; name: string; defaultValue: string; type?: string; required?: boolean }) { return <label className="grid gap-2 text-sm">{label}<input className="min-h-11 rounded-xl border bg-background px-3" defaultValue={defaultValue} name={name} required={required} type={type}/></label>; }
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <article className="rounded-xl border bg-background/25 p-4"><h3 className="flex items-center gap-2 font-semibold text-brand">{icon}{title}</h3><dl className="mt-3">{children}</dl></article>; }
function Value({ label, value }: { label: string; value: string }) { return <div className="flex min-h-10 items-start justify-between gap-3 border-b py-2 last:border-0"><dt className="text-sm text-muted">{label}</dt><dd className="text-right text-sm font-medium">{value}</dd></div>; }
