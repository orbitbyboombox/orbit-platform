import { CommandCenter } from "@/features/operations/components";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OperationsPage() {
  const client = await createSupabaseServerClient();
  const [projects, { data: assignments, error: assignmentError }, { count: staffCount, error: staffError }] = await Promise.all([
    new SupabaseCustomerRepository(client).findAll(),
    client.from("assignments").select("id,project_id,assignment_type,status,resources").is("deleted_at", null),
    client.from("staff").select("id", { count: "exact", head: true }).eq("status", "ACTIVE").is("deleted_at", null),
  ]);
  if (assignmentError) throw assignmentError;
  if (staffError) throw staffError;
  return <CommandCenter assignments={(assignments ?? []).map((item) => ({ id: item.id, projectId: item.project_id, type: item.assignment_type, status: item.status, resources: item.resources as Record<string, unknown> }))} projects={projects} staffCount={staffCount ?? 0} />;
}
