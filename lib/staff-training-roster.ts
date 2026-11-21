import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrainingRosterEntry = {
  id: string;
  projectId: string;
  traineeName: string;
  trainerName: string;
  status: "PLANNED" | "COMPLETED" | "CANCELLED";
  trainingAmountClp: number;
};

/** Read-only data for official event roster integration. Never posts payroll. */
export async function loadEventTrainingRoster(projectId: string): Promise<TrainingRosterEntry[]> {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Authentication required");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Admin access required");
  const { data: assignments, error } = await client.from("staff_training_assignments")
    .select("id,project_id,trainee_staff_id,trainer_staff_id,status,training_amount_clp")
    .eq("project_id", projectId).order("created_at");
  if (error) throw new Error("Could not load training assignments");
  const ids = [...new Set((assignments ?? []).flatMap(a => [a.trainee_staff_id, a.trainer_staff_id]))];
  if (!ids.length) return [];
  const { data: staff, error: staffError } = await client.from("staff").select("id,first_name,last_name").in("id", ids);
  if (staffError) throw new Error("Could not load training staff");
  const names = new Map((staff ?? []).map(person => [person.id, [person.first_name, person.last_name].filter(Boolean).join(" ")]));
  return (assignments ?? []).map(a => ({
    id: a.id, projectId: a.project_id,
    traineeName: names.get(a.trainee_staff_id) ?? "Operador sin nombre",
    trainerName: names.get(a.trainer_staff_id) ?? "Capacitador sin nombre",
    status: a.status as TrainingRosterEntry["status"],
    trainingAmountClp: a.training_amount_clp,
  }));
}
