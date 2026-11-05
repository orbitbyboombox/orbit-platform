import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventTotemLayoutEditor } from "@/features/operations/event-totem-layout-editor";
import { EventTotemRosterPrint } from "@/features/operations/event-totem-roster-print";
import { saveEventTotemLayoutAction } from "@/features/operations/event-totem-layout.actions";
import { emptyTotemLayout, type EventTotemLayout } from "@/features/operations/event-totem-layout";

/** Standalone Admin entry point, kept separate from the existing event editor. */
export default async function EventTotemsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(projectId)) notFound();
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "CEO") notFound();
  const [{ data: project }, { data: blocks }, { data: assignments }, { data: assets }] = await Promise.all([
    db.from("projects").select("id,name,orbit_event_id,operations").eq("id", projectId).is("deleted_at", null).single(),
    db.from("event_operational_blocks").select("id,name").eq("project_id", projectId),
    db.from("assignments").select("id,block_id,assignment_type,staff(first_name,last_name)").eq("project_id", projectId).is("deleted_at", null),
    db.from("operational_assets").select("id,asset_code").eq("asset_type", "CASE"),
  ]);
  if (!project) notFound();
  const operations = project.operations as Record<string, unknown> | null;
  const stored = operations?.totemLayout as EventTotemLayout | undefined;
  const layout = stored && Array.isArray(stored.positions) ? stored : emptyTotemLayout();
  const blockOptions = (blocks ?? []).map(block => ({ id: block.id, label: block.name ?? "Bloque" }));
  const assignmentOptions = (assignments ?? []).filter(item => item.block_id && item.assignment_type === "OPERATOR").map(item => {
    const staff = item.staff as unknown as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    const person = Array.isArray(staff) ? staff[0] : staff;
    return { id: item.id, blockId: item.block_id!, label: [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Operador" };
  });
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Multicaja · {project.orbit_event_id ?? project.name}</h1><p className="text-sm opacity-70">Ubicaciones y operadores por bloque. No modifica la reserva ni los pagos.</p></header>
    <EventTotemLayoutEditor initialLayout={layout} boxes={(assets ?? []).map(asset => ({ id: asset.id, label: asset.asset_code ?? asset.id }))} blocks={blockOptions} assignments={assignmentOptions} onSave={saveEventTotemLayoutAction.bind(null, projectId)} />
    <EventTotemRosterPrint eventName={project.orbit_event_id ?? project.name} layout={layout} blocks={blockOptions.map(item => ({ id: item.id, name: item.label }))} boxes={(assets ?? []).map(asset => ({ id: asset.id, label: asset.asset_code ?? asset.id }))} assignments={assignmentOptions} />
  </main>;
}
