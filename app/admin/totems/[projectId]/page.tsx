import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventTotemAdminWorkspace } from "@/features/operations/event-totem-admin-workspace";
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
  // CCU-only draft: reuse existing operator assignments, without writing anything until Save.
  // Ordering is a suggested starting point, not a claim about the physical placement.
  if (!stored && project.orbit_event_id === "ORB-2026-268105" && blockOptions.length === 2) {
    const perBlock = blockOptions.map(block => assignmentOptions.filter(item => item.blockId === block.id).sort((a, b) => a.label.localeCompare(b.label, "es")));
    if (perBlock.every(items => items.length === 7)) {
      layout.enabled = true;
      layout.positions = layout.positions.map((position, index) => ({
        ...position,
        blocks: blockOptions.map((block, blockIndex) => ({ blockId: block.id, assignmentId: perBlock[blockIndex][index].id })),
      }));
    }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <header className="print:hidden"><h1 className="text-2xl font-semibold">Multicaja · {project.orbit_event_id ?? project.name}</h1><p className="text-sm opacity-70">Ubicaciones y operadores por bloque. No modifica la reserva ni los pagos.</p></header>
    <EventTotemAdminWorkspace eventName={project.orbit_event_id ?? project.name} initialLayout={layout} boxes={(assets ?? []).map(asset => ({ id: asset.id, label: asset.asset_code ?? asset.id }))} blocks={blockOptions} assignments={assignmentOptions} onSave={saveEventTotemLayoutAction.bind(null, projectId)} />
  </main>;
}
