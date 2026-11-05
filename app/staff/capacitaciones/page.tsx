import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingPreviewWorkspace } from "@/components/training-preview-workspace";

export const dynamic = "force-dynamic";

/** Admin-only, read-only training preview. No settlement writes. */
export default async function StaffTrainingPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/?access=admin");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/?error=access-denied");
  const [staffResult, eventResult] = await Promise.all([
    client.from("staff").select("id,first_name,last_name").is("deleted_at", null).order("first_name").limit(500),
    client.from("projects").select("id,name,orbit_event_id,event_date").is("deleted_at", null).order("event_date", { ascending: false }).limit(200),
  ]);
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">Staff · Capacitaciones</h1>
    <p className="text-sm opacity-75">Vista de preparación: operadores y eventos reales, sin generar pagos.</p>
    {(staffResult.error || eventResult.error) && <p role="alert">No se pudo cargar toda la información de Staff y eventos.</p>}
    <TrainingPreviewWorkspace
      staff={(staffResult.data ?? []).map(s => ({ id: s.id, name: [s.first_name, s.last_name].filter(Boolean).join(" ") }))}
      events={(eventResult.data ?? []).map(e => ({ id: e.id, name: [e.orbit_event_id, e.name, e.event_date].filter(Boolean).join(" · ") }))}
    />
  </main>;
}
