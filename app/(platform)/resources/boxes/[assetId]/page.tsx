import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadBoxDetail } from "@/features/resources/box-inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BoxDetailPage({ params }: { params: Promise<{ assetId: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { assetId } = await params;
  const detail = await loadBoxDetail(client, assetId);
  if (!detail) notFound();
  const name = typeof detail.box.metadata?.name === "string" ? detail.box.metadata.name : detail.box.asset_code;
  return <main className="space-y-6">
    <Link href="/resources/boxes" className="text-sm text-muted hover:text-foreground">← Cajas</Link>
    <header><p className="text-xs uppercase tracking-[.18em] text-brand">Inventario / Caja</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">{name}</h1><p className="mt-1 text-sm text-muted">{detail.box.asset_code} · {detail.box.status}</p></div><span className="rounded-full border px-3 py-1 text-sm">{detail.box.storage_location ?? "Ubicación no registrada"}</span></div></header>
    <nav className="flex flex-wrap gap-2 text-sm"><a href="#summary" className="rounded-full border px-3 py-1.5">Resumen</a><a href="#contents" className="rounded-full border px-3 py-1.5">Contenido</a><a href="#events" className="rounded-full border px-3 py-1.5">Eventos</a><a href="#history" className="rounded-full border px-3 py-1.5">Historial</a></nav>
    <section id="summary" className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Componentes</p><p className="mt-2 text-3xl font-semibold">{detail.children.length}</p></div><div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Asignaciones</p><p className="mt-2 text-3xl font-semibold">{detail.assignments.length}</p></div><div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Inspecciones</p><p className="mt-2 text-3xl font-semibold">{detail.inspections.length}</p></div></section>
    <section id="contents" className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Contenido</h2><div className="mt-4 divide-y">{detail.children.map((child) => { const childName = typeof child.metadata?.name === "string" ? child.metadata.name : child.asset_code; return <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{childName}</p><p className="text-sm text-muted">{child.asset_code} · {child.asset_type}</p></div><span className="text-sm text-muted">{child.status}</span></div>; })}{!detail.children.length && <p className="text-sm text-muted">Sin componentes asignados.</p>}</div></section>
    <section id="events" className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Eventos y asignaciones</h2><div className="mt-4 divide-y">{detail.assignments.map((assignment) => { const project = Array.isArray(assignment.projects) ? assignment.projects[0] : assignment.projects; return <div key={assignment.id} className="py-3"><p className="font-medium">{project?.name ?? assignment.project_id}</p><p className="text-sm text-muted">{assignment.assignment_status} · {assignment.planned_start_at ? new Date(assignment.planned_start_at).toLocaleString("es-CL") : "Ventana no registrada"}</p></div>; })}{!detail.assignments.length && <p className="text-sm text-muted">Sin asignaciones.</p>}</div></section>
    <section id="history" className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Inspecciones / historial</h2><div className="mt-4 divide-y">{detail.inspections.map((inspection) => <div key={inspection.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{inspection.inspection_type} · {inspection.inspection_status}</p><p className="text-sm text-muted">{inspection.notes ?? "Sin notas"}</p></div><span className="text-sm text-muted">{inspection.incident_flag ? "Incidente" : "Sin incidente"}</span></div>)}{!detail.inspections.length && <p className="text-sm text-muted">Sin inspecciones registradas.</p>}</div></section>
  </main>;
}
