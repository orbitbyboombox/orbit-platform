import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventTotemAdminWorkspace } from "@/features/operations/event-totem-admin-workspace";
import { AdminPaperBlockManualPanel } from "@/features/operations/admin-paper-block-manual-panel";
import { saveEventTotemLayoutAction } from "@/features/operations/event-totem-layout.actions";
import { emptyTotemLayout, prepareTotemDraft, type EventTotemLayout } from "@/features/operations/event-totem-layout";

/** Standalone Admin entry point, kept separate from the existing event editor. */
export default async function EventTotemsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(projectId)) notFound();
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "CEO") notFound();
  const [{ data: project }, { data: blocks }, { data: assignments }, { data: assets }, { data: requirements }, { data: snapshots }] = await Promise.all([
    db.from("projects").select("id,name,orbit_event_id,operations").eq("id", projectId).is("deleted_at", null).single(),
    db.from("event_operational_blocks").select("id,name").eq("project_id", projectId),
    db.from("assignments").select("id,block_id,assignment_type,status,staff(first_name,last_name)").eq("project_id", projectId).is("deleted_at", null).in("status", ["ASSIGNED", "PENDING_CONFIRMATION", "ACCEPTED", "CONFIRMED"]),
    db.from("operational_assets").select("id,asset_code").eq("asset_type", "CASE").is("deleted_at", null),
    db.from("event_operational_requirements").select("required_quantity").eq("project_id", projectId).eq("status", "ACTIVE").eq("requirement_type", "PHYSICAL_UNIT").eq("asset_type", "CASE"),
    db.from("event_paper_snapshots").select("box_asset_id,opening_balance").eq("project_id", projectId).eq("paper_required", true),
  ]);
  if (!project) notFound();
  const operations = project.operations as Record<string, unknown> | null;
  const stored = operations?.totemLayout as EventTotemLayout | undefined;
  const requiredCaseCount = Math.max(1, (requirements ?? []).reduce((total, item) => total + Number(item.required_quantity ?? 0), 0));
  const blockOptions = (blocks ?? []).map(block => ({ id: block.id, label: block.name ?? "Bloque" }));
  const assignmentOptions = (assignments ?? []).filter(item => item.assignment_type === "OPERATOR").map(item => {
    const staff = item.staff as unknown as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    const person = Array.isArray(staff) ? staff[0] : staff;
    const state = item.status === "CONFIRMED" ? "Confirmado" : item.status === "ACCEPTED" ? "Aceptado" : "Pendiente";
    return { id: item.id, blockId: item.block_id, assignmentType: item.assignment_type, label: `${[person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Operador"} · ${state}` };
  });
  const baseLayout = stored && Array.isArray(stored.positions) ? stored : emptyTotemLayout(project.orbit_event_id === "ORB-2026-268105" ? 7 : requiredCaseCount);
  const layout = prepareTotemDraft(baseLayout, blockOptions, assignmentOptions, requiredCaseCount);
  const snapshotByAsset = new Map((snapshots ?? []).map(item => [item.box_asset_id, Number(item.opening_balance)]));
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <nav className="print:hidden"><Link href="/operations" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-white/5">← Volver a ORBIT</Link></nav>
    <header className="print:hidden"><h1 className="text-2xl font-semibold">Multicaja · {project.orbit_event_id ?? project.name}</h1><p className="text-sm opacity-70">Ubicaciones y operadores por bloque. No modifica la reserva ni los pagos.</p></header>
    <EventTotemAdminWorkspace eventName={project.orbit_event_id ?? project.name} initialLayout={layout} requiredCaseCount={requiredCaseCount} boxes={(assets ?? []).map(asset => ({ id: asset.id, label: asset.asset_code ?? asset.id, stock: snapshotByAsset.get(asset.id) }))} blocks={blockOptions} assignments={assignmentOptions} onSave={saveEventTotemLayoutAction.bind(null, projectId)} />
    <AdminPaperBlockManualPanel projectId={projectId} />
  </main>;
}
