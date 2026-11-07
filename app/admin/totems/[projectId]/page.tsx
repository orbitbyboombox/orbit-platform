import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventTotemAdminWorkspace } from "@/features/operations/event-totem-admin-workspace";
import { AdminPaperBlockManualPanel } from "@/features/operations/admin-paper-block-manual-panel";
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
  const layout = stored && Array.isArray(stored.positions) ? stored : emptyTotemLayout(project.orbit_event_id === "ORB-2026-268105" ? 7 : 1);
  const blockOptions = (blocks ?? []).map(block => ({ id: block.id, label: block.name ?? "Bloque" }));
  const assignmentOptions = (assignments ?? []).filter(item => item.block_id && item.assignment_type === "OPERATOR").map(item => {
    const staff = item.staff as unknown as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    const person = Array.isArray(staff) ? staff[0] : staff;
    return { id: item.id, blockId: item.block_id!, label: [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Operador" };
  });
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
    <header className="print:hidden rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><nav aria-label="Navegación Multicaja" className="mb-4 flex flex-wrap gap-2 text-sm"><Link href="/admin" className="rounded-lg border border-white/20 px-3 py-2 font-medium hover:bg-white/10">← Volver a ORBIT</Link><Link href={`/admin/events/${projectId}`} className="rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10">Ver evento</Link></nav><p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Operaciones · BOOMBOX</p><h1 className="mt-1 text-2xl font-semibold">Multicaja · {project.orbit_event_id ?? project.name}</h1><p className="mt-1 text-sm opacity-70">Cajas, ubicaciones y operadores por bloque. Sin cambios en reserva ni pagos.</p></header>
    <EventTotemAdminWorkspace eventName={project.orbit_event_id ?? project.name} initialLayout={layout} boxes={(assets ?? []).map(asset => ({ id: asset.id, label: asset.asset_code ?? asset.id }))} blocks={blockOptions} assignments={assignmentOptions} onSave={saveEventTotemLayoutAction.bind(null, projectId)} />
    <AdminPaperBlockManualPanel projectId={projectId} />
  </main>;
}
