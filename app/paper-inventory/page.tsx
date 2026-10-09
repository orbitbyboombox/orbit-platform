import Link from "next/link";
import { PaperMovementForm } from "./movement-form";
import { getLowBoxPaperAlerts } from "@/src/lib/paper-inventory/alerts";
import { inventoryKey, type PaperBalances } from "@/src/lib/paper-inventory/domain";
import { isWarehousePaperSku, WAREHOUSE_PAPER_SKUS } from "@/src/lib/paper-inventory/format-map";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PaperFormatRow = { format_key: string; label: string; enabled: boolean };
type PaperMovementRow = { id: string; sku: string; kind: string; quantity: number; created_at: string; reason: string | null; from_location: string | null; to_location: string | null };

const formatNumber = (value: number) => new Intl.NumberFormat("es-CL").format(value);

export default async function PaperInventoryPage() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");

  const [formatsResponse, movementsResponse] = await Promise.all([
    client.from("box_media_formats").select("format_key,label,enabled").order("label"),
    client.from("paper_warehouse_movements").select("id,sku,kind,quantity,created_at,reason,from_location,to_location").order("created_at", { ascending: false }).limit(25),
  ]);
  // The new ledger tables exist only after the reviewed migration is applied.
  const balancesResponse = await client.from("paper_warehouse_balances").select("sku,location,quantity");
  const warehouseBalances: PaperBalances = {};
  if (!balancesResponse.error) {
    for (const row of balancesResponse.data ?? []) {
      if (!isWarehousePaperSku(row.sku)) continue;
      if (row.location !== "warehouse" && !/^box:[a-zA-Z0-9_-]+$/.test(row.location)) continue;
      warehouseBalances[inventoryKey(row.location as "warehouse" | `box:${string}`, row.sku)] = Number(row.quantity);
    }
  }
  const alerts = balancesResponse.error ? [] : getLowBoxPaperAlerts(warehouseBalances);
  const stockRows = Object.entries(warehouseBalances).map(([key, quantity]) => {
    const [location, sku] = JSON.parse(key) as [string, string];
    return { location, sku, quantity };
  }).sort((a, b) => a.location.localeCompare(b.location) || a.sku.localeCompare(b.sku));
  const warehouseTotal = stockRows.filter(row => row.location === "warehouse").reduce((sum, row) => sum + row.quantity, 0);
  const boxesTotal = stockRows.filter(row => row.location.startsWith("box:")).reduce((sum, row) => sum + row.quantity, 0);
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
        <span className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">Movimientos de bodega · conciliación pendiente</span>
      </header>
      {hasError && <div role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-200">No fue posible consultar todos los registros. No se muestran saldos estimados como si fueran oficiales.</div>}
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Stock declarado en bodega</p><p className="mt-3 text-3xl font-semibold">{formatNumber(18900)}</p><p className="mt-2 text-xs text-amber-400">Pendiente de ingresar y validar formato · no es saldo oficial</p></article>
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Formatos configurados</p><p className="mt-3 text-3xl font-semibold">{formats.filter(f => f.enabled).length}</p><p className="mt-2 text-xs text-neutral-400">Catálogo de ORBIT</p></article>
        <article className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><p className="text-sm text-neutral-400">Movimientos recientes</p><p className="mt-3 text-3xl font-semibold">{movements.length}</p><p className="mt-2 text-xs text-neutral-400">Últimos 25 registros como máximo</p></article>
      </section>
      {!balancesResponse.error && <section className="space-y-3"><h2 className="text-lg font-semibold">Stock oficial del nuevo inventario</h2><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-neutral-800 p-4">Bodega: <strong>{formatNumber(warehouseTotal)}</strong> impresiones</div><div className="rounded-xl border border-neutral-800 p-4">Cajas: <strong>{formatNumber(boxesTotal)}</strong> impresiones</div></div><div className="overflow-x-auto rounded-xl border border-neutral-800"><table className="w-full text-left text-sm"><thead className="bg-neutral-900 text-neutral-300"><tr><th className="p-3">Ubicación</th><th className="p-3">Formato</th><th className="p-3 text-right">Impresiones</th></tr></thead><tbody>{stockRows.map(row => <tr key={`${row.location}:${row.sku}`} className="border-t border-neutral-800"><td className="p-3">{row.location === "warehouse" ? "Bodega" : `Caja ${row.location.slice(4)}`}</td><td className="p-3">{isWarehousePaperSku(row.sku) ? WAREHOUSE_PAPER_SKUS[row.sku].label : row.sku}</td><td className="p-3 text-right font-semibold">{formatNumber(row.quantity)}</td></tr>)}</tbody></table>{stockRows.length === 0 && <p className="p-4 text-sm text-amber-300">Aún no se ha conciliado ni ingresado stock inicial. No asumir saldo cero en las cajas existentes.</p>}</div></section>}
      {balancesResponse.error ? <div role="status" className="rounded-xl border border-amber-800 p-4 text-sm text-amber-300">El inventario nuevo aún no está disponible en esta base de datos. Las alertas y movimientos se habilitarán al aplicar la migración validada.</div> : <section aria-label="Alertas de papel bajo" className="space-y-3"><h2 className="text-lg font-semibold">Alertas de cajas</h2>{alerts.length === 0 ? <p className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-400">No hay cajas con menos de 100 impresiones registradas en el nuevo inventario.</p> : alerts.map(alert => <div key={`${alert.boxNumber}:${alert.sku}`} role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-200"><strong>{alert.message}</strong><p className="mt-1 text-sm">Quedan {formatNumber(alert.remaining)} impresiones · {alert.sku}</p></div>)}</section>}
      {!balancesResponse.error && <PaperMovementForm />}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><h2 className="text-lg font-semibold">Formatos de papel</h2><div className="mt-5 space-y-3">{formats.map(format => <div key={format.format_key} className="flex items-center justify-between rounded-xl bg-[#22262d] px-4 py-3"><span>{format.label}</span><span className="text-xs text-neutral-400">{format.enabled ? "Activo" : "Inactivo"}</span></div>)}{formats.length === 0 && <p className="text-sm text-neutral-400">Sin formatos disponibles.</p>}</div></div>
        <div className="rounded-2xl border border-neutral-800 bg-[#181b20] p-6"><h2 className="text-lg font-semibold">Últimos movimientos</h2><div className="mt-5 space-y-3">{movements.map(movement => <div key={movement.id} className="flex justify-between gap-3 border-b border-neutral-800 pb-3 text-sm"><div><p>{movement.kind}</p><p className="text-xs text-neutral-400">{movement.sku} · {new Date(movement.created_at).toLocaleDateString("es-CL")} · {movement.from_location ?? "Ingreso"} → {movement.to_location ?? "Consumo"}</p></div><strong>{formatNumber(Number(movement.quantity))}</strong></div>)}{movements.length === 0 && <p className="text-sm text-neutral-400">Aún no hay movimientos registrados.</p>}</div></div>
      </section>
      <p className="text-xs text-neutral-500">Los movimientos requieren la migración de base de datos y permisos de administrador. El cierre automático de eventos sigue pendiente de integración.</p>
    </div>
  </main>;
}
