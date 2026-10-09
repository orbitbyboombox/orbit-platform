import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PaperFormatRow = { format_key: string; label: string; enabled: boolean };
type PaperMovementRow = { id: string; format_key: string | null; movement_type: string; quantity: number; occurred_at: string; reason: string | null };

const formatNumber = (value: number) => new Intl.NumberFormat("es-CL").format(value);

export default async function PaperInventoryPage() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");

  const [formatsResponse, movementsResponse] = await Promise.all([
    client.from("box_media_formats").select("format_key,label,enabled").order("label"),
    client.from("inventory_movements").select("id,format_key,movement_type,quantity,occurred_at,reason").is("deleted_at", null).order("occurred_at", { ascending: false }).limit(25),
  ]);
  const formats = (formatsResponse.data ?? []) as PaperFormatRow[];
  const movements = (movementsResponse.data ?? []) as PaperMovementRow[];
  const hasError = Boolean(formatsResponse.error || movementsResponse.error);

  return <main className="min-h-screen bg-[#0d0f13] px-4 py-8 text-white md:px-10">
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><Link href="/operations" className="text-sm text-neutral-400 hover:text-white">← Volver a Operaciones</Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.25em] text-[#F78900]">BOOMBOX · CAJAS</p>
          <h1 className="mt-2 text-3xl font-semibold">Inventario de papel</h1>
          <p className="mt-2 text-sm text-neutral-400">Bodega, formatos y movimientos registrados.</p></div>
        <span className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">Solo lectura · conciliación pendiente</span>
      </header>
      {hasError && <div role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-200">No fue posible consultar todos los registros. No se muestran saldos estimados como si fueran oficiales.</div>}
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Stock declarado en bodega</p><p className="mt-3 text-3xl font-semibold">{formatNumber(18900)}</p><p className="mt-2 text-xs text-amber-400">Pendiente de ingresar y validar formato · no es saldo oficial</p></article>
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Formatos configurados</p><p className="mt-3 text-3xl font-semibold">{formats.filter(f => f.enabled).length}</p><p className="mt-2 text-xs text-neutral-400">Catálogo de ORBIT</p></article>
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Movimientos recientes</p><p className="mt-3 text-3xl font-semibold">{movements.length}</p><p className="mt-2 text-xs text-neutral-400">Últimos 25 registros como máximo</p></article>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><h2 className="text-lg font-semibold">Formatos de papel</h2><div className="mt-5 space-y-3">{formats.map(format => <div key={format.format_key} className="flex items-center justify-between rounded-xl bg-[#22262d] px-4 py-3"><span>{format.label}</span><span className="text-xs text-neutral-400">{format.enabled ? "Activo" : "Inactivo"}</span></div>)}{formats.length === 0 && <p className="text-sm text-neutral-400">Sin formatos disponibles.</p>}</div></div>
        <div className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><h2 className="text-lg font-semibold">Últimos movimientos</h2><div className="mt-5 space-y-3">{movements.map(movement => <div key={movement.id} className="flex justify-between gap-3 border-b border-neutral-800 pb-3 text-sm"><div><p>{movement.movement_type}</p><p className="text-xs text-neutral-400">{movement.format_key ?? "Sin formato"} · {new Date(movement.occurred_at).toLocaleDateString("es-CL")}</p></div><strong>{formatNumber(Number(movement.quantity))}</strong></div>)}{movements.length === 0 && <p className="text-sm text-neutral-400">Aún no hay movimientos registrados.</p>}</div></div>
      </section>
      <p className="text-xs text-neutral-500">La carga de stock, las transferencias y el cierre automático se habilitarán después de validar la conciliación de cajas y costos. No se realizan escrituras desde esta pantalla.</p>
    </div>
  </main>;
}
