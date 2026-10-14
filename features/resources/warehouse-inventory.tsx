import type { InventoryMovement, SupplyInventoryItem } from "@/features/supply-engine/types/supply.types";

type WarehouseInventoryProps = {
  supplies: readonly SupplyInventoryItem[];
  movements: readonly InventoryMovement[];
};

const movementLabel: Record<InventoryMovement["movementType"], string> = {
  PURCHASE: "Entrada",
  CONSUMPTION: "Consumo",
  ADJUSTMENT: "Ajuste",
  LOSS: "Merma",
  REPLACEMENT: "Reposición",
};

const formatQuantity = (value: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value);

/** Read-only warehouse ledger. Writes remain behind the canonical inventory RPC. */
export function WarehouseInventory({ supplies, movements }: WarehouseInventoryProps) {
  const lowStock = supplies.filter((item) => item.stockStatus !== "NORMAL");
  return <section aria-labelledby="warehouse-inventory-title" className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Bodega · lectura</p>
      <h2 id="warehouse-inventory-title" className="mt-1 text-xl font-semibold">Inventario de consumibles</h2>
      <p className="mt-2 text-sm text-muted">Saldos y movimientos auditables desde las fuentes existentes. Esta vista no modifica stock ni confunde consumibles con Cajas.</p>
    </header>
    {lowStock.length ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Atención: {lowStock.length} consumible{lowStock.length === 1 ? "" : "s"} requiere{lowStock.length === 1 ? "" : "n"} revisión de stock.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{supplies.map((item) => <article className="rounded-xl border p-4" key={item.recordId}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted">{item.id} · {item.unit}</p></div><span className="shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold">{item.stockStatus === "NORMAL" ? "Normal" : item.stockStatus === "LOW_STOCK" ? "Bajo" : "Sin stock"}</span></div><p className="mt-4 text-2xl font-semibold">{formatQuantity(item.currentStock)}</p><p className="text-xs text-muted">Stock actual{item.minimumStock == null ? "" : ` · mínimo ${formatQuantity(item.minimumStock)}`}</p></article>)}</div>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Ver movimientos auditables ({movements.length})</summary><div className="mt-4 space-y-2">{movements.slice(0, 100).map((movement) => <div className="grid gap-1 border-b pb-2 text-sm last:border-0 sm:grid-cols-[1fr_auto]" key={movement.id}><div><p className="font-medium">{movementLabel[movement.movementType]} · {movement.reason}</p><p className="text-xs text-muted">{new Date(movement.occurredAt).toLocaleString("es-CL")} · {movement.projectId ?? "Sin evento"}</p></div><p className="font-semibold">{movement.quantity > 0 ? "+" : ""}{formatQuantity(movement.quantity)}</p></div>)}{!movements.length ? <p className="text-sm text-muted">No hay movimientos registrados.</p> : null}</div></details>
  </section>;
}
