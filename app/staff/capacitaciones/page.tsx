import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingPreviewWorkspace } from "@/components/training-preview-workspace";
import { trainingSettlementPreview } from "@/lib/staff-training-settlement-preview";

export const dynamic = "force-dynamic";

export default async function StaffTrainingPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/?access=admin");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/?error=access-denied");
  const [staffResult, eventResult, trainingResult] = await Promise.all([
    client.from("staff").select("id,first_name,last_name").is("deleted_at", null).order("first_name").limit(500),
    client.from("projects").select("id,name,orbit_event_id,event_date").is("deleted_at", null).order("event_date", { ascending: false }).limit(200),
    client.from("staff_training_assignments").select("id,project_id,trainee_staff_id,trainer_staff_id,status,training_amount_clp").order("created_at", { ascending: false }).limit(200),
  ]);
  const staff = (staffResult.data ?? []).map(s => ({ id: s.id, name: [s.first_name, s.last_name].filter(Boolean).join(" ") }));
  const events = (eventResult.data ?? []).map(e => ({ id: e.id, name: [e.orbit_event_id, e.name, e.event_date].filter(Boolean).join(" · ") }));
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
    <h1 className="text-2xl font-bold">Staff · Capacitaciones</h1>
    {(staffResult.error || eventResult.error || trainingResult.error) && <p role="alert">No se pudo cargar toda la información. Reintenta antes de registrar.</p>}
    <TrainingPreviewWorkspace staff={staff} events={events} />
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Capacitaciones registradas</h2>
      <p className="text-sm">Vista de control (últimos 200 registros). Pagos completados elegibles: ${summary.payableClp.toLocaleString("es-CL")} CLP. Pendientes: {summary.pendingCount}. Canceladas: {summary.cancelledCount}.</p>
      <p className="text-xs">Esta cifra es informativa; no se agrega a liquidaciones ni se paga automáticamente.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Evento</th><th className="p-2">En capacitación</th><th className="p-2">Capacitador</th><th className="p-2">Estado</th><th className="p-2">Monto</th></tr></thead>
        <tbody>{training.map(t => <tr key={t.id} className="border-t">
          <td className="p-2">{eventNames.get(t.projectId) ?? t.projectId}</td>
          <td className="p-2">{t.trainee}</td><td className="p-2">{t.trainer}</td>
          <td className="p-2">{t.status}</td><td className="p-2">${t.trainingAmountClp.toLocaleString("es-CL")}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </main>;
}
