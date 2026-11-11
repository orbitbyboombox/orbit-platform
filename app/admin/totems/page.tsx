
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
  const { data: projects, error } = await db.from("projects")
    .select("id,orbit_event_id,name,event_date,operations")
    .is("deleted_at", null)
    .order("event_date", { ascending: false })
    .limit(100);
  if (error) throw new Error("No se pudo cargar la lista de eventos");
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <nav className="print:hidden"><Link href="/operations" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-white/5">← Volver a ORBIT</Link></nav>
    <header><h1 className="text-2xl font-semibold">Multicaja por evento</h1>
      <p className="text-sm opacity-70">Activa varias CASE únicamente en los eventos que lo necesiten. Se reutilizan los bloques y operadores existentes.</p></header>
    <div className="space-y-2">{(projects ?? []).map(project => {
      const operations = project.operations as Record<string, unknown> | null;
      const layout = operations?.totemLayout as { enabled?: boolean; positions?: unknown[] } | undefined;
      return <Link key={project.id} href={`/admin/totems/${project.id}`} className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-white/5">
        <span><strong>{project.orbit_event_id ?? project.name}</strong><span className="block text-sm opacity-70">{project.name} · {formatDisplayDate(project.event_date)}</span></span>
        <span className="text-sm">{layout?.enabled ? `Activo · ${layout.positions?.length ?? 0} CASE` : "Configurar multicaja →"}</span>
      </Link>;
    })}</div>
  </main>;
}
