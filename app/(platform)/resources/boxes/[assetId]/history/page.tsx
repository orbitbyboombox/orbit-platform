import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { blackBoxNumber, blackBoxStock, loadBoxHistory } from "@/features/resources/box-inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoxHistoryEventActions } from "@/features/resources/box-history-event-actions";

const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString("es-CL") : "No registrado";

export default async function BoxHistoryPage({ params }: { params: Promise<{ assetId: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { assetId } = await params;
  const history = await loadBoxHistory(client, assetId);
  if (!history) notFound();
  const { box, events } = history;
  const boxName = typeof box.metadata?.name === "string" ? box.metadata.name : `Caja ${blackBoxNumber(box.asset_code)}`;

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/resources/boxes" className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold hover:border-brand hover:text-brand">← Volver a Cajas</Link>
    <header className="rounded-2xl border bg-card p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">LOGÍSTICA · HISTORIAL DE CAJA</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold">{boxName}</h1><p className="mt-1 text-sm text-muted">{box.asset_code} · {box.status}{box.storage_location ? ` · ${box.storage_location}` : ""}</p></div>
        <div className="rounded-xl border bg-background/40 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Saldo maestro actual</p><p className="mt-1 text-2xl font-semibold">{blackBoxStock(box.metadata)} <span className="text-sm font-normal text-muted">fotos</span></p></div>
      </div>
    </header>
    <section aria-labelledby="box-history-title" className="rounded-2xl border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="box-history-title" className="text-xl font-semibold">Eventos de esta caja</h2><p className="mt-1 text-sm text-muted">Más reciente primero. Selecciona cada evento para ver el detalle operativo y de papel.</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">{events.length} eventos</span></div>
      <div className="mt-5 space-y-3">
        {events.map(({ assignment, project, snapshot }) => <details key={assignment.id} className="rounded-xl border bg-background/30 p-4">
          <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{project?.name ?? assignment.project_id}</p><p className="mt-1 text-sm text-muted">{project?.event_date ?? "Fecha no registrada"}{project?.event_time ? ` · ${project.event_time.slice(0, 5)}` : ""} · {assignment.assignment_status}</p></div><span className="text-sm text-muted">{assignment.planned_start_at ? formatDate(assignment.planned_start_at) : "Horario no registrado"}</span></div></summary>
          <div className="mt-4 grid min-w-0 gap-3 border-t pt-4 text-sm sm:grid-cols-2"><div className="min-w-0"><p className="font-semibold">Evento y operador</p><p className="break-all text-muted">ID de asignación: {assignment.id}</p><p className="text-muted">Ubicación: {project?.location ?? "No registrada"}</p>{(() => { const operators = (project?.assignments ?? []).filter((item) => item.assignment_type === "OPERATOR").map((item) => { const staff = Array.isArray(item.staff) ? item.staff[0] : item.staff; return staff ? `${staff.first_name} ${staff.last_name}` : null; }).filter(Boolean); return <p className="text-muted">Operador: {operators.length ? operators.join(", ") : "No registrado"}</p>; })()}<p className="text-muted">Inicio: {formatDate(assignment.planned_start_at)}</p><p className="text-muted">Fin: {formatDate(assignment.planned_end_at)}</p><p className="text-muted">Asignada: {formatDate(assignment.assigned_at)}</p><p className="text-muted">Devuelta: {formatDate(assignment.returned_at)}</p></div><div className="min-w-0"><p className="font-semibold">Papel del evento</p>{snapshot ? <><p className="text-muted">Estado: {snapshot.status}</p><p className="text-muted">Inicial: {snapshot.opening_balance ?? "—"}</p><p className="text-muted">Consumo: {snapshot.event_usage ?? "—"}</p><p className="text-muted">Saldo final: {snapshot.final_remaining_balance ?? "—"}</p><p className="text-muted">Cierre: {formatDate(snapshot.overridden_at ?? snapshot.confirmed_at)}</p>{snapshot.close_note ? <p className="mt-2 text-muted">Motivo: {snapshot.close_note}</p> : null}</> : <p className="text-muted">Sin snapshot de papel asociado.</p>}</div></div>
          <BoxHistoryEventActions projectId={assignment.project_id} assignmentId={assignment.id} eventName={project?.name ?? assignment.project_id} boxCode={box.asset_code} />
          {assignment.return_condition || assignment.return_notes ? <div className="mt-3 rounded-lg border p-3 text-sm"><p className="font-semibold">Retorno</p><p className="text-muted">{assignment.return_condition ?? "Condición no registrada"}{assignment.return_notes ? ` · ${assignment.return_notes}` : ""}</p></div> : null}
        </details>)}
        {!events.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Esta caja todavía no tiene eventos registrados.</p> : null}
      </div>
    </section>
  </main>;
}
