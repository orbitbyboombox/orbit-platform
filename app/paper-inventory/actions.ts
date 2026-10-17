"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWarehousePaperSku } from "@/src/lib/paper-inventory/format-map";

export type MovementResult = { ok: boolean; message: string };

export async function recordPaperMovement(_previous: MovementResult, form: FormData): Promise<MovementResult> {
  const client = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { ok: false, message: "Sesión no válida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    return { ok: false, message: "No tienes permisos para modificar el inventario." };

  const sku = String(form.get("sku") ?? "");
  const kind = String(form.get("kind") ?? "");
  const quantity = Number(form.get("quantity"));
  const box = String(form.get("box") ?? "").trim();
  const eventId = String(form.get("eventId") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const key = String(form.get("idempotencyKey") ?? "").trim();

  if (!isWarehousePaperSku(sku) || !["opening","purchase","transfer","return","consumption","adjustment"].includes(kind))
    return { ok: false, message: "Formato o movimiento no válido." };
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return { ok: false, message: "Ingresa una cantidad entera mayor a cero." };
  if (!/^[0-9a-f-]{36}$/i.test(key)) return { ok: false, message: "Identificador de operación inválido." };
  if (["transfer","return","consumption"].includes(kind) && !/^[a-zA-Z0-9_-]+$/.test(box))
    return { ok: false, message: "Debes indicar una caja válida." };
  if (kind === "consumption" && !eventId)
    return { ok: false, message: "El consumo requiere el identificador del evento." };
  if (kind === "consumption") return { ok: false, message: "Consumo manual bloqueado hasta integrar el cierre de eventos de CAJAS." };
  if (kind === "adjustment") return { ok: false, message: "Los ajustes requieren conciliación supervisada." };
  // Opening stock is blocked until warehouse physical stock and SKU are reconciled.
  if (kind === "opening") return { ok: false, message: "El saldo inicial requiere conciliación previa." };
  const from = kind === "transfer" ? "warehouse" : kind === "return" || kind === "consumption" ? `box:${box}` : null;
  const to = kind === "purchase" || kind === "return" ? "warehouse" : kind === "transfer" ? `box:${box}` : null;
  const { error } = await client.rpc("record_paper_warehouse_movement", {
    p_idempotency_key: key, p_sku: sku, p_kind: kind, p_quantity: quantity,
    p_from_location: from, p_to_location: to,
    p_orbit_event_id: kind === "consumption" ? eventId : null,
    p_reason: reason || null,
  });
  if (error) return { ok: false, message: "No se registró el movimiento: " + error.message };
  revalidatePath("/paper-inventory");
  return { ok: true, message: "Movimiento registrado correctamente." };
}
