"use client";

import {
  Archive,
  CalendarDays,
  Copy,
  ExternalLink,
  MoreVertical,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import type { CrmOperationalEvent } from "./types";
import {
  duplicateCrmEventAction,
  transitionCrmEventAction,
  updateCrmEventAction,
} from "./actions";
import { shiftEventScheduleDate } from "./event-schedule";
import { FOUNDER_FORCE_DELETE_CONFIRMATION, TEST_FULL_PURGE_CONFIRMATION } from "@/features/founder-force-delete/policy";

type View =
  | "TODAY"
  | "UPCOMING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED"
  | "ALL";

const today = new Date().toISOString().slice(0, 10);
const statusOf = (event: CrmOperationalEvent): View => {
  const status = event.status.toUpperCase();
  if (status === "ARCHIVED") return "ARCHIVED";
  if (["CANCELLED", "CANCELED"].includes(status)) return "CANCELLED";
  if (
    ["COMPLETED", "FINISHED"].includes(status) ||
    (event.date && event.date < today)
  )
    return "COMPLETED";
  if (event.date === today) return "TODAY";
  return "UPCOMING";
};

export function EventCenter({
  canForceDelete,
  initialEvents,
}: {
  canForceDelete: boolean;
  initialEvents: CrmOperationalEvent[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("UPCOMING");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CrmOperationalEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmOperationalEvent | null>(null);
  const [testPurgeRequested, setTestPurgeRequested] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [serviceEndAt, setServiceEndAt] = useState("");
  const [staffCallAt, setStaffCallAt] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, start] = useTransition();
  const events = initialEvents;
  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (view === "ALL" || statusOf(event) === view) &&
          `${event.customerName} ${event.company} ${event.date ?? ""} ${event.service} ${event.operator} ${event.status}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [events, query, view],
  );

  const openEditor = (event: CrmOperationalEvent) => {
    const operationalDate = event.serviceStartAt?.slice(0, 10) ?? event.date ?? "";
    const canonicalDate = event.date ?? operationalDate;
    setEditing(event);
    setEditDate(canonicalDate);
    setServiceEndAt(
      shiftEventScheduleDate(event.serviceEndAt, operationalDate, canonicalDate),
    );
    setStaffCallAt(
      shiftEventScheduleDate(event.staffCallAt, operationalDate, canonicalDate),
    );
    setError("");
    setFeedback("");
  };
  const changeDate = (nextDate: string) => {
    setServiceEndAt((value) =>
      shiftEventScheduleDate(value, editDate, nextDate),
    );
    setStaffCallAt((value) =>
      shiftEventScheduleDate(value, editDate, nextDate),
    );
    setEditDate(nextDate);
  };
  const lifecycle = (
    event: CrmOperationalEvent,
    action: "ARCHIVE" | "PERMANENT_DELETE",
  ) => {
    const warning =
      action === "PERMANENT_DELETE"
        ? "Eliminar SOLO este Evento. El Cliente permanecerá dentro del CRM. ¿Continuar?"
        : "Archivar este Evento y excluirlo de la operación activa. ¿Continuar?";
    if (!window.confirm(warning)) return;
    const confirmation = action === "PERMANENT_DELETE"
      ? window.prompt("Escribe ELIMINAR para confirmar la purga definitiva:")?.trim()
      : undefined;
    if (action === "PERMANENT_DELETE" && confirmation !== "ELIMINAR") return;
    const reason = action === "PERMANENT_DELETE"
      ? "Eliminación integral solicitada por Founder."
      : window.prompt("Motivo obligatorio:")?.trim();
    if (!reason) return;
    start(async () => {
      const result = await transitionCrmEventAction({
        customerId: event.customerId,
        projectId: event.projectId,
        action,
        reason,
        confirmation,
      });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  };
  const openDeleteDialog = (event: CrmOperationalEvent) => {
    setDeleteTarget(event);
    setDeleteConfirmation("");
    setTestPurgeRequested(event.dataClassification === "QA" || event.dataClassification === "TEST");
  };
  const closeDeleteDialog = () => {
    if (!pending) {
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setTestPurgeRequested(false);
    }
  };
  const confirmDelete = () => {
    const isTestPurge = testPurgeRequested || deleteTarget?.dataClassification === "QA" || deleteTarget?.dataClassification === "TEST";
    const requiredConfirmation = isTestPurge ? TEST_FULL_PURGE_CONFIRMATION : FOUNDER_FORCE_DELETE_CONFIRMATION;
    if (!deleteTarget || deleteConfirmation !== requiredConfirmation) return;
    const target = deleteTarget;
    start(async () => {
      const result = await transitionCrmEventAction({
        customerId: target.customerId,
        projectId: target.projectId,
        action: isTestPurge ? "TEST_FULL_PURGE" : "PERMANENT_DELETE",
        reason: isTestPurge ? "Purga completa QA solicitada por Founder." : "Eliminación integral solicitada por Founder.",
        confirmation: deleteConfirmation,
      });
      if (!result.ok) setError(result.message);
      else {
        setDeleteTarget(null);
        setTestPurgeRequested(false);
        router.refresh();
      }
    });
  };
  const duplicate = (event: CrmOperationalEvent) => {
    const copyStaff = window.confirm("¿Copiar Staff como asignación pendiente?");
    const reason = window.prompt("Motivo de duplicación:")?.trim();
    if (!reason) return;
    start(async () => {
      const result = await duplicateCrmEventAction({
        customerId: event.customerId,
        projectId: event.projectId,
        copyStaff,
        reason,
      });
      if (!result.ok) setError(result.error);
      else router.push(`/projects/${result.projectId}`);
    });
  };
  const submit = (form: FormData) => {
    if (!editing) return;
    setError("");
    start(async () => {
      const result = await updateCrmEventAction({
        customerId: editing.customerId,
        projectId: editing.projectId,
        date: String(form.get("date")),
        time: String(form.get("time")),
        serviceEndAt: String(form.get("serviceEndAt")),
        staffCallAt: String(form.get("staffCallAt")),
        type: String(form.get("type")),
        location: String(form.get("location")),
        eventAddress: String(form.get("eventAddress")),
        municipality: String(form.get("municipality")),
        service: String(form.get("service")),
        duration: String(form.get("duration")),
        transport: String(form.get("transport")),
        reason: String(form.get("reason")),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFeedback(
        `${result.message}${result.warning ? ` · ${result.warning}` : ""}`,
      );
      setEditing(null);
      router.refresh();
    });
  };
  const tabs: [View, string][] = [
    ["TODAY", "Eventos de hoy"],
    ["UPCOMING", "Próximos"],
    ["COMPLETED", "Completados"],
    ["CANCELLED", "Cancelados"],
    ["ARCHIVED", "Archivados"],
    ["ALL", "Todos"],
  ];

  return (
    <div className="space-y-7">
      <header className="rounded-[28px] border border-white/10 bg-[#111214] p-6 text-white shadow-[0_20px_70px_rgba(0,0,0,.18)] sm:p-8">
        <p className="text-xs uppercase tracking-[.18em] text-brand">
          BOOMBOX · OPERACIÓN
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="mt-2 text-3xl font-semibold">Eventos</h1>
          <p className="mt-2 text-sm text-white/60">Vista semanal · operación activa</p></div>
          <Link className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-black" href="/projects/new">Nuevo evento</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[["TOTAL", events.length], ["PRÓXIMOS", events.filter((event) => statusOf(event) === "UPCOMING").length], ["HOY", events.filter((event) => statusOf(event) === "TODAY").length]].map(([label, value]) => <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4" key={String(label)}><p className="text-xs tracking-[.16em] text-white/45">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
        </div>
        <p className="mt-5 text-sm text-white/60">
          Gestiona todos los eventos BOOMBOX sin salir del CRM.
        </p>
      </header>
      <div className="flex flex-wrap gap-2 pb-1 md:flex-nowrap md:overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            className={`min-w-0 rounded-xl border px-3 py-2 text-sm md:shrink-0 md:px-4 ${view === key ? "border-brand bg-brand/10 text-brand" : ""}`}
            key={key}
            onClick={() => setView(key)}
          >
            {label} ·{" "}
            {events.filter((event) => key === "ALL" || statusOf(event) === key)
              .length}
          </button>
        ))}
      </div>
      <label className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-[#191a1d] px-4 text-white">
        <Search className="size-4 text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar cliente, empresa, fecha, servicio, operador o estado"
          value={query}
        />
      </label>
      {feedback ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300"
        >
          {feedback}
        </p>
      ) : null}
      {error && !editing ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <section className="space-y-3">
        {filtered.map((event) => (
          <article
            className="group grid min-w-0 gap-4 rounded-2xl border border-white/10 bg-[#191a1d] p-4 text-white shadow-[0_10px_35px_rgba(0,0,0,.12)] transition hover:border-brand/70 sm:p-5 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center"
            key={event.projectId}
          >
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#0d0e10] text-center ring-1 ring-white/10">
              <span className="text-[10px] uppercase tracking-[.16em] text-brand">{event.date ? new Date(`${event.date}T12:00:00Z`).toLocaleDateString("es-CL", { weekday: "short" }) : "—"}</span>
              <strong className="text-2xl leading-none">{event.date?.slice(8, 10) ?? "—"}</strong>
              <span className="text-[10px] text-white/50">{event.date?.slice(5, 7) ?? ""}</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-brand" />
                <h2 className="min-w-0 break-words font-semibold">
                  {event.customerName}
                </h2>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">
                  {event.status}
                </span>
              </div>
              <p className="mt-2 break-words text-sm text-white/60">
                {event.company || "Cliente particular"} ·{" "}
                {event.date
                  ? new Date(`${event.date}T12:00:00Z`).toLocaleDateString(
                      "es-CL",
                    )
                  : "Sin fecha"} · {event.time?.slice(0, 5) || "Sin hora"}
              </p>
              <p className="mt-1 break-words text-sm font-semibold text-white/80">
                {event.service || "Servicio por confirmar"}
                {event.duration ? ` · ${event.duration}h` : ""} · {event.time?.slice(0, 5) || "Sin hora"}–{event.serviceEndAt?.slice(11, 16) || "—"}
              </p>
              <p className="mt-1 break-words text-xs text-white/60">
                {event.location || "Lugar por confirmar"} · {event.municipality || "Comuna por confirmar"}
              </p>
              <p className="mt-1 break-words text-xs text-white/45">
                Citación {event.staffCallAt?.slice(11, 16) || "por confirmar"} · {event.extras.length ? event.extras.join(" + ") : "Sin extras"} · Operador: {event.operator}
              </p>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="hidden text-xs text-white/45 md:block">Abrir</span>
              <Link
                className="rounded-xl border px-3 py-2 text-sm"
                href={`/customers/${event.customerId}`}
              >
                Cliente
              </Link>
              <details className="relative">
                <summary
                  aria-label={`Acciones para ${event.name}`}
                  className="grid size-10 cursor-pointer list-none place-items-center rounded-xl border"
                >
                  <MoreVertical className="size-4" />
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-3rem)] rounded-xl border bg-card p-2 shadow-xl">
                  <Link
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                    href={`/projects/${event.projectId}`}
                  >
                    <ExternalLink className="size-4" />Abrir Evento
                  </Link>
                  {canForceDelete ? <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => openEditor(event)}
                  >
                    Editar Evento
                  </button> : null}
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => duplicate(event)}
                  >
                    <Copy className="size-4" />Duplicar Evento
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => lifecycle(event, "ARCHIVE")}
                  >
                    <Archive className="size-4" />Archivar Evento
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                    onClick={() => openDeleteDialog(event)}
                  >
                    <Trash2 className="size-4" />Eliminar Evento
                  </button>
                </div>
              </details>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted">
            No hay eventos para esta vista.
          </p>
        )}
      </section>
      {editing && (
        <MobileDialog
          description="Modifica y guarda los datos operacionales canónicos del Evento."
          footer={
            <div className="flex gap-2">
              <button
                className="min-h-11 flex-1 rounded-xl border px-4"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-primary-foreground"
                aria-busy={pending} disabled={pending}
                form="mobile-event-editor"
              >
                {pending ? "Guardando y sincronizando…" : "Guardar cambios"}
              </button>
            </div>
          }
          onClose={() => setEditing(null)}
          title="Editar Evento"
          variant="fullscreen-mobile"
        >
          <form
            action={submit}
            className="grid gap-4 sm:grid-cols-2"
            id="mobile-event-editor"
          >
            <label className="text-sm">
              <span className="mb-1.5 block text-muted">Fecha</span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                name="date"
                onChange={(event) => changeDate(event.target.value)}
                required
                type="date"
                value={editDate}
              />
            </label>
            {[
              ["time", "Hora", editing.time?.slice(0, 5) ?? "", "time"],
              ["type", "Tipo", editing.type, "text"],
              ["location", "Lugar", editing.location ?? "", "text"],
              ["eventAddress", "Dirección", editing.eventAddress, "text"],
              [
                "municipality",
                "Comuna",
                editing.municipality ?? "",
                "text",
              ],
              ["service", "Servicio", editing.service, "text"],
              [
                "duration",
                "Duración",
                String(editing.duration ?? ""),
                "number",
              ],
              ["transport", "Transporte", String(editing.transport), "number"],
            ].map(([name, label, value, type]) => (
              <label className="text-sm" key={name}>
                <span className="mb-1.5 block text-muted">{label}</span>
                <input
                  className="h-11 w-full rounded-xl border bg-background px-3"
                  defaultValue={value}
                  name={name}
                  type={type}
                />
              </label>
            ))}
            <label className="text-sm">
              <span className="mb-1.5 block text-muted">
                Término del servicio
              </span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                name="serviceEndAt"
                onChange={(event) => setServiceEndAt(event.target.value)}
                required
                type="datetime-local"
                value={serviceEndAt}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-muted">Citación Staff</span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                name="staffCallAt"
                onChange={(event) => setStaffCallAt(event.target.value)}
                type="datetime-local"
                value={staffCallAt}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1.5 block text-muted">
                Motivo obligatorio
              </span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                minLength={3}
                name="reason"
                required
              />
            </label>
            {error ? (
              <p className="text-sm text-danger sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </MobileDialog>
      )}
      {deleteTarget ? (
        (() => { const isTestPurge = deleteTarget.dataClassification === "QA" || deleteTarget.dataClassification === "TEST"; const requiredConfirmation = isTestPurge ? TEST_FULL_PURGE_CONFIRMATION : FOUNDER_FORCE_DELETE_CONFIRMATION; return (
        <MobileDialog
          eyebrow="Acción irreversible"
          title="Eliminar Evento"
          description={isTestPurge ? "Esta acción eliminará definitivamente la prueba QA y sus dependencias exclusivas. El cliente permanecerá en el CRM." : "Esta acción eliminará definitivamente este registro y sus dependencias operacionales. El cliente permanecerá en el CRM."}
          onClose={closeDeleteDialog}
          dismissOnOverlayClick={!pending}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="min-h-11 rounded-xl border px-4" aria-busy={pending} disabled={pending} onClick={closeDeleteDialog} type="button">Cancelar</button>
              <button className="min-h-11 rounded-xl bg-red-600 px-4 font-semibold text-white disabled:opacity-50" aria-busy={pending} disabled={pending || deleteConfirmation !== requiredConfirmation} onClick={confirmDelete} type="button">{pending ? "Eliminando…" : isTestPurge ? "PURGAR PRUEBA" : "ELIMINAR TODO"}</button>
            </div>
          }
        >
          <div className="grid gap-4 text-sm">
            {pending ? <div aria-live="polite" aria-busy="true" className="rounded-xl border border-brand/30 bg-brand/5 p-4"><OrbitLoader label="Eliminando evento · liberando recursos · limpiando documentos · sincronizando integraciones…" variant="inline" /></div> : null}
            <dl className="grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
              <div><dt className="text-muted">Cliente</dt><dd className="font-medium">{deleteTarget.customerName}</dd></div>
              <div><dt className="text-muted">Empresa</dt><dd className="font-medium">{deleteTarget.company || "Sin empresa"}</dd></div>
              <div><dt className="text-muted">Fecha</dt><dd className="font-medium">{deleteTarget.date || "Sin fecha"}</dd></div>
              <div><dt className="text-muted">Hora</dt><dd className="font-medium">{deleteTarget.serviceStartAt?.slice(11, 16) || "Sin hora"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">ORB</dt><dd className="font-medium">{deleteTarget.orbitEventId || "Sin código"}</dd></div>
            </dl>
            {!isTestPurge && canForceDelete ? <button className="rounded-xl border border-red-300 px-4 py-3 text-left text-sm text-red-700" type="button" onClick={() => { setTestPurgeRequested(true); setDeleteConfirmation(""); }}>Purgar prueba total…<span className="mt-1 block text-xs text-muted">Solo Founder/CEO. Elimina físicamente todo el grafo QA/TEST y exige PURGAR PRUEBA TOTAL.</span></button> : null}
            <label className="grid gap-2 font-medium">Escribe {requiredConfirmation}<input autoComplete="off" className="min-h-11 rounded-xl border bg-background px-3" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
          </div>
        </MobileDialog>
        ); })()
      ) : null}
    </div>
  );
}
