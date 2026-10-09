"use client";

import { useActionState, useState } from "react";
import { recordPaperMovement, type MovementResult } from "./actions";
import { WAREHOUSE_PAPER_SKUS, type WarehousePaperSku } from "@/src/lib/paper-inventory/format-map";

const initial: MovementResult = { ok: false, message: "" };

export function PaperMovementForm() {
  const [state, action, pending] = useActionState(recordPaperMovement, initial);
  const [kind, setKind] = useState("purchase");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [previousMessage, setPreviousMessage] = useState("");
  return <form action={action} className="space-y-4 rounded-2xl border border-neutral-800 bg-[#181b20] p-6">
    <h2 className="text-lg font-semibold">Registrar movimiento</h2>
    <input type="hidden" name="idempotencyKey" value={key} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm">Tipo de movimiento
        <select name="kind" value={kind} onChange={e => setKind(e.target.value)} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3">
          <option value="purchase">Ingreso por compra</option>
          <option value="transfer">Bodega → cabina</option>
          <option value="return">Cabina → bodega</option>
          <option value="consumption">Consumo de evento</option>
        </select>
      </label>
      <label className="space-y-2 text-sm">Formato
        <select name="sku" required className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3">
          {(Object.keys(WAREHOUSE_PAPER_SKUS) as WarehousePaperSku[]).map(sku => <option key={sku} value={sku}>{WAREHOUSE_PAPER_SKUS[sku].label}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-sm">Cantidad de fotos
        <input name="quantity" type="number" min="1" step="1" required className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3" />
      </label>
      {kind !== "purchase" && <label className="space-y-2 text-sm">Código de caja
        <input name="box" required placeholder="Ej.: 2" pattern="[a-zA-Z0-9_-]+" className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3" />
      </label>}
      {kind === "consumption" && <label className="space-y-2 text-sm">ID del evento
        <input name="eventId" required className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3" />
      </label>}
    </div>
    <label className="block space-y-2 text-sm">Observación
      <input name="reason" maxLength={500} placeholder="Referencia de compra, entrega o devolución" className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3" />
    </label>
    {state.message && <p role="status" className={`text-sm ${state.ok ? "text-green-400" : "text-amber-400"}`}>{state.message}</p>}
    {previousMessage && <p className="text-xs text-neutral-400">{previousMessage}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={pending || Boolean(state.ok)} className="rounded-lg bg-[#F78900] px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? "Guardando…" : "Guardar movimiento"}</button>
      <button type="button" onClick={() => { setKey(crypto.randomUUID()); setPreviousMessage("Nuevo identificador listo. Confirma que no estás duplicando un movimiento anterior."); }} className="rounded-lg border border-neutral-700 px-5 py-3 text-sm">Nueva operación</button>
    </div>
    <p className="text-xs text-neutral-400">Cada envío usa una clave única para evitar duplicaciones. El saldo inicial se concilia por separado.</p>
  </form>;
}
