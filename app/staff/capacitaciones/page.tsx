import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingPreviewWorkspace } from "@/components/training-preview-workspace";
import { TrainingRecordActions } from "@/components/training-record-actions";
import { trainingSettlementPreview } from "@/lib/staff-training-settlement-preview";

export const dynamic = "force-dynamic";

export default async function StaffTrainingPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/?access=admin");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/?error=access-denied");
  const today = new Date().toISOString().slice(0, 10);
  const [staffResult, eventResult, trainingResult] = await Promise.all([
    client.from("staff").select("id,first_name,last_name").is("deleted_at", null).order("first_name").limit(500),
    client.from("projects").select("id,name,orbit_event_id,event_date").is("deleted_at", null).gte("event_date", today).order("event_date", { ascending: true }).limit(1000),
    client.from("staff_training_assignments").select("id,project_id,trainee_staff_id,trainer_staff_id,status,training_amount_clp").order("created_at", { ascending: false }).limit(200),
  ]);
  const staff = (staffResult.data ?? []).map(s => ({ id: s.id, name: [s.first_name, s.last_name].filter(Boolean).join(" ") }));
  const events = (eventResult.data ?? []).map(e => ({ id: e.id, date: e.event_date, name: [e.event_date, e.orbit_event_id, e.name].filter(Boolean).join(" · ") }));
  const names = new Map(staff.map(s => [s.id, s.name]));
  const eventNames = new Map(events.map(e => [e.id, e.name]));
  const training = (trainingResult.data ?? []).map(t => ({
    id: t.id, projectId: t.project_id, trainee: names.get(t.trainee_staff_id) ?? t.trainee_staff_id,
    trainer: names.get(t.trainer_staff_id) ?? t.trainer_staff_id,
    status: t.status as "PLANNED" | "COMPLETED" | "CANCELLED",
    trainingAmountClp: Number(t.training_amount_clp),
  }));
  const summary = trainingSettlementPreview(training);
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Staff · Capacitaciones</h1><a href="/operations" className="rounded-lg border px-3 py-2 text-sm">Volver a ORBIT</a></div>
    {(staffResult.error || eventResult.error || trainingResult.error) && <p role="alert">No se pudo cargar toda la información. Reintenta antes de registrar.</p>}
    <TrainingPreviewWorkspace staff={staff} events={events} />
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Capacitaciones registradas</h2>
      <p className="text-sm">Vista de control (últimos 200 registros). Pagos completados elegibles: CLP {summary.payableClp.toLocaleString("es-CL")}. Pendientes: {summary.pendingCount}. Canceladas: {summary.cancelledCount}.</p>
      <p className="text-xs">Esta cifra es informativa: las capacitaciones completadas se incluyen en la liquidación mensual abierta correspondiente; no se ejecutan pagos automáticamente.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Evento</th><th className="p-2">En capacitación</th><th className="p-2">Capacitador</th><th className="p-2">Estado</th><th className="p-2">Monto</th></tr></thead>
        <tbody>{training.map(t => <tr key={t.id} className="border-t">
          <td className="p-2">{eventNames.get(t.projectId) ?? t.projectId}</td>
          <td className="p-2">{t.trainee}</td><td className="p-2">{t.trainer}</td>
          <td className="p-2">{t.status} <TrainingRecordActions id={t.id} status={t.status} /></td><td className="p-2">CLP {t.trainingAmountClp.toLocaleString("es-CL")}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </main>;
}
