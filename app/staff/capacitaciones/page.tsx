import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingPreviewWorkspace } from "@/components/training-preview-workspace";

export const dynamic = "force-dynamic";

/** Admin-only staging route. No database writes or settlement actions. */
export default async function StaffTrainingPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/?access=admin");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/?error=access-denied");
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">Staff · Capacitaciones</h1>
    <p className="text-sm opacity-75">Vista de preparación. No crea asignaciones ni genera pagos.</p>
    <TrainingPreviewWorkspace />
  </main>;
}
