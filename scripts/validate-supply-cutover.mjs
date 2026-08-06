import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase validation environment variables.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const certificationId = `pc05-${Date.now()}`;
const now = new Date().toISOString();

const { data: users, error: usersError } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
if (usersError) throw usersError;
const actorId = users.users[0]?.id;
if (!actorId) throw new Error("No authenticated actor is available for certification.");

const { data: project, error: projectError } = await client
  .from("projects")
  .select("id,customer_id,orbit_event_id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (projectError) throw projectError;

const { data: created, error: createError } = await client.from("supplies").insert({
  catalog_code: certificationId,
  name: "Insumo certificación PC-05",
  supplier: "Certificación interna",
  purchase_price: 1000,
  vat_included: true,
  unit: "EVENT",
  useful_life: 1,
  calculation_method: "DIRECT_EVENT_COST",
  status: "ACTIVE",
  metadata: { usefulLifeLabel: "1 evento", certification: true },
  created_by: actorId,
  updated_by: actorId,
}).select("id,version").single();
if (createError) throw createError;

const { data: updated, error: updateError } = await client.from("supplies")
  .update({ purchase_price: 1200, updated_by: actorId, approval_reason: "PC-05 update validation" })
  .eq("id", created.id).eq("version", created.version).select("version").single();
if (updateError) throw updateError;

const movementIds = [];
for (const movement of [
  { type: "PURCHASE", quantity: 10, reason: "PC-05 purchase validation" },
  { type: "CONSUMPTION", quantity: -3, reason: "PC-05 consumption validation" },
  { type: "ADJUSTMENT", quantity: 1, reason: "PC-05 adjustment validation" },
]) {
  const { data, error } = await client.rpc("register_inventory_movement", {
    p_supply_id: created.id,
    p_movement_type: movement.type,
    p_quantity: movement.quantity,
    p_occurred_at: now,
    p_reason: movement.reason,
    p_orbit_event_id: project?.orbit_event_id ?? certificationId,
    p_customer_id: project?.customer_id ?? null,
    p_project_id: project?.id ?? null,
    p_staff_id: null,
    p_vehicle_id: "CERT-PC05",
    p_unit_cost: 1200,
    p_actor_id: actorId,
  });
  if (error) throw error;
  movementIds.push(data);
}

const { data: stocked, error: stockError } = await client.from("supplies")
  .select("version,current_stock,stock_status")
  .eq("id", created.id).single();
if (stockError) throw stockError;
if (Number(stocked.current_stock) !== 8) throw new Error(`Unexpected stock: ${stocked.current_stock}`);

const { data: deleted, error: deleteError } = await client.from("supplies")
  .update({ deleted_at: now, deleted_by: actorId, updated_by: actorId, approval_reason: "PC-05 soft delete validation" })
  .eq("id", created.id).eq("version", stocked.version).select("version,deleted_at").single();
if (deleteError) throw deleteError;

const { data: restored, error: restoreError } = await client.from("supplies")
  .update({ deleted_at: null, deleted_by: null, updated_by: actorId, approval_reason: "PC-05 restore validation" })
  .eq("id", created.id).eq("version", deleted.version).select("version,deleted_at,current_stock").single();
if (restoreError) throw restoreError;

const { count: auditCount, error: auditError } = await client.from("audit_events")
  .select("id", { count: "exact", head: true })
  .in("entity_type", ["supplies", "inventory_movements"])
  .or(`entity_id.eq.${created.id},entity_id.in.(${movementIds.join(",")})`);
if (auditError) throw auditError;

const { count: timelineCount, error: timelineError } = await client.from("timeline_events")
  .select("id", { count: "exact", head: true })
  .eq("correlation_id", `inventory-${movementIds[0]}`);
if (timelineError) throw timelineError;

const archiveTime = new Date().toISOString();
const { error: finalDeleteError } = await client.from("supplies")
  .update({ deleted_at: archiveTime, deleted_by: actorId, updated_by: actorId, approval_reason: "PC-05 certification archived" })
  .eq("id", created.id).eq("version", restored.version);
if (finalDeleteError) throw finalDeleteError;

console.log(JSON.stringify({
  certificationId,
  created: true,
  updateVersion: updated.version,
  purchaseRegistered: true,
  consumptionRegistered: true,
  adjustmentRegistered: true,
  stockAfterMovements: Number(stocked.current_stock),
  stockStatus: stocked.stock_status,
  softDelete: Boolean(deleted.deleted_at),
  restore: restored.deleted_at === null,
  reloadPersistence: Number(restored.current_stock) === 8,
  auditEvents: auditCount,
  timelineProjection: timelineCount === 1,
  archivedAfterCertification: true,
}, null, 2));
