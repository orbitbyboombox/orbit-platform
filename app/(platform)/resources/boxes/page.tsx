import Link from "next/link";
import { redirect } from "next/navigation";
import { loadBoxes } from "@/features/resources/box-inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BoxesPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const boxes = await loadBoxes(client);
  return <main className="space-y-6">
    <header><p className="text-xs uppercase tracking-[.18em] text-brand">Inventario operacional</p><h1 className="mt-2 text-3xl font-semibold">Cajas</h1><p className="mt-2 text-sm text-muted">Cajas físicas, contenido y asignaciones operacionales.</p></header>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {boxes.map((box) => { const name = typeof box.metadata?.name === "string" ? box.metadata.name : box.asset_code; return <Link key={box.id} href={`/resources/boxes/${box.id}`} className="rounded-2xl border bg-card p-5 transition hover:border-brand/60"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.14em] text-muted">{box.asset_code}</p><h2 className="mt-1 text-xl font-semibold">{name}</h2></div><span className="rounded-full border px-2.5 py-1 text-xs">{box.status}</span></div><p className="mt-5 text-sm text-muted">{box.childCount} componentes · {box.storage_location ?? "Ubicación no registrada"}</p></Link>; })}
      {!boxes.length && <div className="rounded-2xl border border-dashed p-8 text-sm text-muted">Aún no hay cajas registradas.</div>}
    </section>
  </main>;
}
