
import {formatDisplayDate} from "@/lib/display-date";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Optional multicaja entry for existing events; does not create or duplicate events. */
export default async function MulticajaEventsPage() {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "CEO") notFound();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const [{ data: projects, error }, { data: audit, error: auditError }] = await Promise.all([
    db.from("projects")
    .select("id,orbit_event_id,name,event_date,operations")
    .is("deleted_at", null)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(500),
    db.from("multicase_assignment_audit").select("project_id,issue_code,detail"),
  ]);
  if (error) throw new Error("No se pudo cargar la lista de eventos");
  if (auditError) throw new Error("No se pudo ejecutar la auditoría preventiva de Multicaja");
  const auditByProject = new Map<string, Array<{ issue_code: string; detail: string }>>();
  for (const row of audit ?? []) auditByProject.set(row.project_id, [...(auditByProject.get(row.project_id) ?? []), row]);
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <nav className="print:hidden"><Link href="/operations" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-white/5">← Volver a ORBIT</Link></nav>
    <header><h1 className="text-2xl font-semibold">Multicaja por evento</h1>
      <p className="text-sm opacity-70">Revisa eventos vigentes y futuros. La auditoría detecta operadores sin bloque o caja, cajas sin inventario y requisitos pendientes. Solo marca brechas; no modifica eventos automáticamente.</p></header>
    <div className="space-y-2">{(projects ?? []).map(project => {
      const operations = project.operations as Record<string, unknown> | null;
      const layout = operations?.totemLayout as { enabled?: boolean; positions?: unknown[] } | undefined;
      return <Link key={project.id} href={`/admin/totems/${project.id}`} className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-white/5">
        <span><strong>{project.orbit_event_id ?? project.name}</strong><span className="block text-sm opacity-70">{project.name} · {formatDisplayDate(project.event_date)}</span></span>
        <span className="text-right text-sm">{auditByProject.get(project.id)?.length ? <><strong className="text-amber-500">{auditByProject.get(project.id)?.length} brecha(s)</strong><span className="block text-xs opacity-70">{[...new Set(auditByProject.get(project.id)?.map(issue => issue.detail))].slice(0, 2).join(" · ")}</span></> : layout?.enabled ? `Sin brechas · ${layout.positions?.length ?? 0} CASE` : "Configurar multicaja →"}</span>
      </Link>;
    })}</div>
  </main>;
}
