"use server";

import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { previewTrainingAssignment, type TrainingAssignment } from "@/lib/staff-training-assignment";

export async function saveStaffTraining(input: TrainingAssignment): Promise<{ ok: boolean; message: string }> {
  let preview: ReturnType<typeof previewTrainingAssignment>;
  try { preview = previewTrainingAssignment(input); }
  catch { return { ok: false, message: "Datos de capacitación inválidos." }; }
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { ok: false, message: "Sesión no válida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { ok: false, message: "Acceso no autorizado." };
  const [event, staff] = await Promise.all([
    client.from("projects").select("id").eq("id", preview.eventId).is("deleted_at", null).maybeSingle(),
    client.from("staff").select("id").in("id", [preview.traineeStaffId, preview.trainerStaffId]).is("deleted_at", null),
  ]);
  if (!event.data || staff.error || staff.data?.length !== 2) return { ok: false, message: "Evento u operadores no disponibles." };
  const { error } = await client.from("staff_training_assignments").insert({
    project_id: preview.eventId,
    trainee_staff_id: preview.traineeStaffId,
    trainer_staff_id: preview.trainerStaffId,
    normal_operator_rate_clp: preview.normalOperatorRateClp,
    training_rate_percent: 50,
    status: "PLANNED",
  });
  if (error?.code === "23505") return { ok: false, message: "Este operador ya tiene una capacitación en el evento." };
  if (error) return { ok: false, message: "No se pudo guardar la capacitación." };
  return { ok: true, message: "Capacitación programada y guardada. No se ha generado pago." };
}

export async function completeStaffTraining(trainingId: string): Promise<{ ok: boolean; message: string }> {
  if (!trainingId.trim()) return { ok: false, message: "Capacitación no válida." };
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { ok: false, message: "Sesión no válida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { ok: false, message: "Acceso no autorizado." };
  const { error } = await client.rpc("complete_staff_training", { p_training_id: trainingId });
  if (error) return { ok: false, message: "No se pudo completar la capacitación." };
  return { ok: true, message: "Capacitación completada e incluida en la próxima liquidación abierta." };
}
