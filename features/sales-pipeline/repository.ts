import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionUrgency, derivePipelineStage, followUpStatus } from "./domain";
import { LEAD_SOURCES, NEXT_ACTION_TYPES, PIPELINE_STAGES, type LeadSource, type NextActionType, type PipelineStage, type SalesLead, type SalesPipelineData } from "./types";
const source = (value: unknown): LeadSource => LEAD_SOURCES.includes(String(value).toUpperCase() as LeadSource) ? String(value).toUpperCase() as LeadSource : "UNKNOWN";
const action = (value: unknown): NextActionType | null => NEXT_ACTION_TYPES.includes(String(value).toUpperCase() as NextActionType) ? String(value).toUpperCase() as NextActionType : null;
type Related = { status?: string; grand_total?: number; final_customer_price?: number; created_at?: string; occurred_at?: string; direction?: string; channel?: string };
type RawRow = { id: string; customer_id: string; orbit_event_id: string; name: string; project_type: string; event_date: string | null; operations: Record<string, unknown> | null; pipeline_stage?: string | null; lead_source?: string | null; next_action_at?: string | null; next_action_type?: string | null; estimated_value?: number | null; follow_up_status?: string | null; lost_reason?: string | null; customers?: { full_name?: string; company?: string | null } | { full_name?: string; company?: string | null }[] | null; project_services?: { service_code: string }[]; quotations?: Related[]; crm_reservations?: Related[] | Related | null; crm_events?: Related[]; financial_event_records?: Related[]; communications?: Related[] };
export async function loadSalesPipeline(): Promise<SalesPipelineData> {
  const admin = createAdminClient();
  const fullSelect = "id,customer_id,orbit_event_id,name,project_type,event_date,operations,pipeline_stage,lead_source,next_action_at,next_action_type,estimated_value,follow_up_status,lost_reason,customers(full_name,company),project_services(service_code),quotations(status,grand_total,final_customer_price,created_at),crm_reservations(status),crm_events(status),financial_event_records(status),communications(occurred_at,direction,channel)";
  let result = await admin.from("projects").select(fullSelect).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500);
  if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
    result = await admin.from("projects").select("id,customer_id,orbit_event_id,name,project_type,event_date,operations,customers(full_name,company),project_services(service_code),quotations(status,grand_total,final_customer_price,created_at),crm_reservations(status),crm_events(status),financial_event_records(status),communications(occurred_at,direction,channel)").is("deleted_at", null).order("updated_at", { ascending: false }).limit(500) as typeof result;
  }
  if (result.error) throw result.error;
  const data = result.data;
  const now = new Date();
  const rows = (data ?? []) as unknown as RawRow[];
  const leads = rows.map((row: RawRow): SalesLead => {
    const op = row.operations ?? {};
    const opText = (key: string) => typeof op[key] === "string" ? op[key] as string : null;
    const opNumber = (key: string) => typeof op[key] === "number" ? op[key] as number : null;
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const quotes = Array.isArray(row.quotations) ? row.quotations : [];
    const reservation = Array.isArray(row.crm_reservations) ? row.crm_reservations[0] : row.crm_reservations;
    const legacyReservationConfirmed = String(op.commercialStage ?? "").toUpperCase() === "CONFIRMED" && String(op.stage ?? "").toUpperCase() === "RESERVA CONFIRMADA" && row.crm_events?.some((event) => !["CANCELLED", "CANCELED", "ARCHIVED"].includes(String(event.status).toUpperCase())) === true && row.financial_event_records?.some((record) => String(record.status).toUpperCase() === "CONFIRMED") === true;
    const communications = Array.isArray(row.communications) ? row.communications : [];
    const latest = communications.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))[0];
    const quote = [...quotes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const stage = derivePipelineStage({ explicit: row.pipeline_stage ?? opText("pipelineStage"), commercialStage: opText("commercialStage"), quotationStatus: quote?.status, reservationStatus: reservation?.status, legacyReservationConfirmed });
    const nextActionAt = row.next_action_at ?? opText("nextActionAt");
    const handoff = communications.some((item) => item.channel === "WHATSAPP_BUSINESS" && item.direction === "INBOUND") && op.humanTakeover === true;
    const optOut = op.contactOptOut === true;
    const closedStage = ["GANADO", "PERDIDO", "CANCELADO", "PRUEBA", "ARCHIVADO"].includes(stage);
    const resolvedFollowUpStatus = closedStage
      ? "CANCELLED"
      : ((row.follow_up_status ?? opText("followUpStatus")) as SalesLead["followUpStatus"] ?? followUpStatus({ stage, humanHandoff: handoff, optOut, deliveryEnabled: process.env.WHATSAPP_DELIVERY_ENABLED === "true", nextActionAt, now }));
    return { id: row.id, customerId: row.customer_id, customerName: customer?.full_name ?? "Cliente sin nombre", company: customer?.company ?? "", eventId: row.orbit_event_id, eventName: row.name, eventType: row.project_type, eventDate: row.event_date, service: row.project_services?.[0]?.service_code ?? "Por confirmar", source: source(row.lead_source ?? opText("leadSource") ?? opText("origin")), stage, estimatedValue: row.estimated_value == null ? (opNumber("estimatedValue") == null ? (quote?.final_customer_price ?? quote?.grand_total ?? null) : opNumber("estimatedValue")) : Number(row.estimated_value), nextActionAt: closedStage ? null : nextActionAt, nextActionType: action(row.next_action_type ?? opText("nextActionType")), followUpStatus: resolvedFollowUpStatus, lastActivityAt: latest?.occurred_at ?? null, overdue: closedStage ? false : Boolean(nextActionAt && new Date(nextActionAt).getTime() < now.getTime()), urgency: closedStage ? "SIN ACCIÓN" : actionUrgency(nextActionAt, now), lostReason: row.lost_reason ?? opText("lostReason") ?? null };
  });
  const counts = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, leads.filter((lead) => lead.stage === stage).length])) as Record<PipelineStage, number>;
  const commercial = leads.filter((lead) => !["PRUEBA", "ARCHIVADO"].includes(lead.stage));
  return { leads, counts, metrics: { newLeads: commercial.filter((lead) => lead.stage === "NUEVO").length, quotes: commercial.filter((lead) => lead.stage === "COTIZACIÓN").length, reservations: commercial.filter((lead) => lead.stage === "RESERVA PENDIENTE").length, won: commercial.filter((lead) => lead.stage === "GANADO").length, lost: commercial.filter((lead) => lead.stage === "PERDIDO").length, cancelled: commercial.filter((lead) => lead.stage === "CANCELADO").length, estimatedValue: commercial.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0), overdue: commercial.filter((lead) => lead.overdue).length } };
}
