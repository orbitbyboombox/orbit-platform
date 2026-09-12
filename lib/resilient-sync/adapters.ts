import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { JsonObject, OperationEnvelope } from "@orbitnova/resilient-sync";
import { prepareFormalQuotePersistence } from "@/features/commercial-hub/quote-persistence";
import type { FormalQuoteDraft } from "@/features/commercial-hub/types";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import type { ProjectDraft } from "@/features/projects/types/project";

type Result = { resource_server_id: string; server_version: number; server_snapshot: JsonObject };
type Conflict = { error_code: "VERSION_CONFLICT"; server_version: number; server_snapshot: JsonObject };

function actorClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) throw new Error("SYNC_ACTOR_TOKEN_REQUIRED");
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

const versionOf = (row: Record<string, unknown>) => Math.max(1, Number(row.version) || Date.parse(String(row.updated_at ?? row.created_at ?? "")) || 1);
const snapshotOf = (row: Record<string, unknown>) => JSON.parse(JSON.stringify(row)) as JsonObject;
function conflict(operation: OperationEnvelope, row: Record<string, unknown>): Conflict | null { const version = versionOf(row); return operation.base_version !== null && operation.base_version !== version ? { error_code: "VERSION_CONFLICT", server_version: version, server_snapshot: snapshotOf(row) } : null; }

async function validateActor(db: ReturnType<typeof actorClient>, actorId: string) {
  const auth = await db.auth.getUser();
  if (!auth.data.user || auth.data.user.id !== actorId) throw new Error("ACTOR_MISMATCH");
  const profile = await db.from("profiles").select("role").eq("id", actorId).maybeSingle();
  if (!profile.data || !["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS"].includes(profile.data.role)) throw new Error("ROLE_NOT_ALLOWED");
}

async function clientMutation(db: ReturnType<typeof actorClient>, operation: OperationEnvelope, actorId: string): Promise<Result | Conflict> {
  const payload = operation.payload;
  if (operation.action === "CREATE") {
    const fullName = String(payload.full_name ?? payload.name ?? payload.contact ?? "").trim();
    if (!fullName) throw new Error("CLIENT_NAME_REQUIRED");
    const inserted = await db.from("customers").insert({ full_name: fullName, company: payload.company || null, rut: payload.rut || null, email: payload.email || null, secondary_email: payload.secondary_email || null, phone: payload.phone || null, address: payload.address || null, city: payload.city || null, metadata: { customerType: payload.customer_type ?? "COMPANY", source: "RESILIENT_SYNC" }, created_by: actorId, updated_by: actorId }).select("*").single();
    if (inserted.error || !inserted.data) throw new Error("CLIENT_CREATE_FAILED");
    return { resource_server_id: inserted.data.id, server_version: versionOf(inserted.data), server_snapshot: snapshotOf(inserted.data) };
  }
  if (!operation.resource_server_id) throw new Error("RESOURCE_SERVER_ID_REQUIRED");
  const current = await db.from("customers").select("*").eq("id", operation.resource_server_id).is("deleted_at", null).maybeSingle();
  if (!current.data) throw new Error("CLIENT_NOT_FOUND");
  const stale = conflict(operation, current.data); if (stale) return stale;
  const allowed = ["full_name", "company", "rut", "email", "secondary_email", "phone", "address", "city"];
  const changes = Object.fromEntries(allowed.filter((key) => key in payload).map((key) => [key, payload[key]]));
  const updated = operation.action === "ARCHIVE" ? await db.from("customers").update({ archived_at: new Date().toISOString(), updated_by: actorId }).eq("id", current.data.id).select("*").single() : await db.from("customers").update({ ...changes, updated_by: actorId }).eq("id", current.data.id).select("*").single();
  if (updated.error || !updated.data) throw new Error("CLIENT_UPDATE_FAILED");
  return { resource_server_id: updated.data.id, server_version: versionOf(updated.data), server_snapshot: snapshotOf(updated.data) };
}

async function quoteMutation(db: ReturnType<typeof actorClient>, operation: OperationEnvelope): Promise<Result | Conflict> {
  const input = operation.payload as unknown as FormalQuoteDraft;
  if (!Array.isArray(input.lines) || !input.lines.length) throw new Error("QUOTE_LINES_REQUIRED");
  const prepared = prepareFormalQuotePersistence(input);
  const quoteId = operation.resource_server_id ?? input.quoteId ?? input.requestId ?? operation.resource_local_id;
  if (operation.action === "ARCHIVE") throw new Error("ARCHIVE_REQUIRES_ONLINE_REVIEW");
  if (operation.action === "UPDATE") {
    const current = await db.from("quotations").select("*").eq("id", quoteId).is("deleted_at", null).maybeSingle();
    if (!current.data) throw new Error("QUOTE_NOT_FOUND");
    const stale = conflict(operation, current.data); if (stale) return stale;
  }
  const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const expiration = new Date(`${issueDate}T12:00:00Z`); expiration.setUTCDate(expiration.getUTCDate() + input.validityDays);
  const saved = await db.rpc("save_commercial_quote_draft", { p_quotation_id: quoteId, p_quote: { issueDate, customerId: input.existingCustomerId, customerSnapshot: prepared.customerSnapshot, commercialSnapshot: prepared.commercialSnapshot, expirationDate: expiration.toISOString().slice(0, 10), subtotal: prepared.calculation.subtotal, discountTotal: prepared.calculation.discount, taxTotal: prepared.calculation.vat, grandTotal: prepared.calculation.total, validityDays: input.validityDays, depositPercent: input.depositPercent, globalDiscountType: input.globalDiscountType, globalDiscountValue: input.globalDiscountValue }, p_items: prepared.items });
  const result = saved.data as { quotationId?: string } | null;
  if (saved.error || !result?.quotationId) throw new Error("QUOTE_DRAFT_SAVE_FAILED");
  const row = await db.from("quotations").select("*").eq("id", result.quotationId).single();
  if (!row.data) throw new Error("QUOTE_DRAFT_READ_FAILED");
  return { resource_server_id: row.data.id, server_version: versionOf(row.data), server_snapshot: snapshotOf(row.data) };
}

async function reservationDraft(db: ReturnType<typeof actorClient>, operation: OperationEnvelope): Promise<Result | Conflict> {
  if (operation.action !== "CREATE") throw new Error("RESERVATION_DRAFT_UPDATE_REQUIRES_ONLINE");
  const repository = new SupabaseCustomerRepository(db);
  const draft = operation.payload as unknown as ProjectDraft;
  const project = await repository.createWithProject(draft);
  const row = await db.from("projects").select("*").eq("id", project.id).single();
  if (!row.data) throw new Error("PROJECT_DRAFT_READ_FAILED");
  return { resource_server_id: project.id, server_version: versionOf(row.data), server_snapshot: snapshotOf(row.data) };
}

async function eventOrNote(db: ReturnType<typeof actorClient>, operation: OperationEnvelope): Promise<Result | Conflict> {
  if (!operation.resource_server_id) throw new Error("PROJECT_ID_REQUIRED");
  const current = await db.from("projects").select("*").eq("id", operation.resource_server_id).is("deleted_at", null).maybeSingle();
  if (!current.data) throw new Error("PROJECT_NOT_FOUND");
  const stale = conflict(operation, current.data); if (stale) return stale;
  const operations = { ...(current.data.operations as Record<string, unknown> ?? {}) };
  if (operation.resource_type === "NOTE" || operation.resource_type === "LOGISTICS_NOTE") operations.notes = operation.payload.notes ?? operation.payload.note ?? operations.notes;
  const changes = operation.resource_type === "EVENT_DRAFT" ? { event_date: operation.payload.event_date ?? current.data.event_date, event_time: operation.payload.event_time ?? current.data.event_time, location: operation.payload.location ?? current.data.location, city: operation.payload.city ?? current.data.city, operations, updated_by: operation.actor_user_id } : { operations, updated_by: operation.actor_user_id };
  const updated = await db.from("projects").update(changes).eq("id", current.data.id).select("*").single();
  if (updated.error || !updated.data) throw new Error("PROJECT_DRAFT_UPDATE_FAILED");
  return { resource_server_id: updated.data.id, server_version: versionOf(updated.data), server_snapshot: snapshotOf(updated.data) };
}

async function expense(db: ReturnType<typeof actorClient>, operation: OperationEnvelope): Promise<Result | Conflict> {
  const p = operation.payload;
  const values = { occurred_on: p.occurred_on ?? p.occurredOn, category: p.category, supplier: p.supplier, document_number: p.document_number ?? null, subtotal: Number(p.subtotal ?? 0), vat: Number(p.vat ?? 0), total: Number(p.total ?? (Number(p.subtotal ?? 0) + Number(p.vat ?? 0) + Number(p.exempt ?? 0))), currency: "CLP", status: p.status ?? "PENDING", project_id: p.project_id ?? null, expense_scope: p.expense_scope ?? "OPERATIONAL", subcategory: p.subcategory ?? null, supplier_rut: p.supplier_rut ?? null, document_type: p.document_type ?? "OTHER", payment_method: p.payment_method ?? "TRANSFER", extraction_status: "CONFIRMED", confirmed_category: p.category, approval_reason: JSON.stringify({ description: p.description ?? "", source: "RESILIENT_SYNC" }), updated_by: operation.actor_user_id };
  if (!values.occurred_on || !values.category || !values.supplier || values.total <= 0) throw new Error("INVALID_EXPENSE");
  if (operation.action === "CREATE") {
    const inserted = await db.from("expenses").insert({ ...values, created_by: operation.actor_user_id }).select("*").single();
    if (inserted.error || !inserted.data) throw new Error("EXPENSE_CREATE_FAILED");
    return { resource_server_id: inserted.data.id, server_version: versionOf(inserted.data), server_snapshot: snapshotOf(inserted.data) };
  }
  if (!operation.resource_server_id) throw new Error("RESOURCE_SERVER_ID_REQUIRED");
  const current = await db.from("expenses").select("*").eq("id", operation.resource_server_id).is("deleted_at", null).maybeSingle();
  if (!current.data) throw new Error("EXPENSE_NOT_FOUND"); const stale = conflict(operation, current.data); if (stale) return stale;
  const updated = await db.from("expenses").update(operation.action === "ARCHIVE" ? { deleted_at: new Date().toISOString(), updated_by: operation.actor_user_id } : values).eq("id", current.data.id).select("*").single();
  if (updated.error || !updated.data) throw new Error("EXPENSE_UPDATE_FAILED");
  return { resource_server_id: updated.data.id, server_version: versionOf(updated.data), server_snapshot: snapshotOf(updated.data) };
}

export async function applyBoomboxOperation(operation: OperationEnvelope, actor: { id: string; accessToken: string }) {
  const db = actorClient(actor.accessToken); await validateActor(db, actor.id);
  switch (operation.resource_type) {
    case "CLIENT": return clientMutation(db, operation, actor.id);
    case "QUOTE_DRAFT": return quoteMutation(db, operation);
    case "RESERVATION_DRAFT": return reservationDraft(db, operation);
    case "EVENT_DRAFT":
    case "NOTE":
    case "LOGISTICS_NOTE": return eventOrNote(db, operation);
    case "EXPENSE": return expense(db, operation);
  }
}
