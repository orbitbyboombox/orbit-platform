import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateQuotation } from "./quotation-engine";
import type { CreateQuotationInput, QuotationCalculation, QuotationStatus } from "./types";

export interface PersistedQuotation { readonly id: string; readonly quotationNumber: string; readonly status: QuotationStatus; readonly calculation: QuotationCalculation; }

export class SupabaseQuotationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateQuotationInput): Promise<PersistedQuotation> {
    const calculation = calculateQuotation(input);
    if (!calculation.ready) throw new Error(calculation.blockers.join(" "));
    const { data: auth, error: authError } = await this.client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida para crear cotizaciones.");
    const year = input.issueDate.slice(0, 4);
    const { count, error: countError } = await this.client.from("quotations").select("id", { count: "exact", head: true }).gte("issue_date", `${year}-01-01`).lte("issue_date", `${year}-12-31`);
    if (countError) throw countError;
    const quotationNumber = `COT-${year}-${String((count ?? 0) + 1).padStart(6, "0")}`;
    const { data, error } = await this.client.from("quotations").insert({ quotation_number: quotationNumber, customer_id: input.customerId, project_id: input.projectId, orbit_event_id: input.orbitEventId, status: "DRAFT", customer_type: input.customerType, event_type: input.eventType, issue_date: input.issueDate, expiration_date: input.expirationDate, subtotal: calculation.subtotal.amount, transport_total: calculation.transport.amount, discount_total: calculation.discount.amount, tax_total: calculation.taxes.amount, grand_total: calculation.grandTotal.amount, official_price: calculation.grandTotal.amount, final_customer_price: calculation.grandTotal.amount, price_difference: 0, pricing_snapshot: { input, calculation }, blockers: [], created_by: auth.user.id, updated_by: auth.user.id }).select("id").single();
    if (error) throw error;
    const items = calculation.lines.map((line) => ({ quotation_id: data.id, item_type: line.code.includes("TRANSPORT") ? "TRANSPORT" : input.services.some(({ serviceId }) => line.code.startsWith(serviceId)) ? "SERVICE" : "EXTRA", code: line.code, label: line.label, quantity: line.quantity, unit_price: line.unitPrice.amount, total: line.total.amount, official_unit_price: line.unitPrice.amount, official_total: line.total.amount, final_unit_price: line.unitPrice.amount, final_total: line.total.amount }));
    if (calculation.transport.amount > 0) items.push({ quotation_id: data.id, item_type: "TRANSPORT", code: "TRANSPORT", label: input.destination, quantity: 1, unit_price: calculation.transport.amount, total: calculation.transport.amount, official_unit_price: calculation.transport.amount, official_total: calculation.transport.amount, final_unit_price: calculation.transport.amount, final_total: calculation.transport.amount });
    if (items.length) { const { error: itemError } = await this.client.from("quotation_items").insert(items); if (itemError) throw itemError; }
    const correlationId = crypto.randomUUID();
    const { error: timelineError } = await this.client.from("timeline_events").insert({ customer_id: input.customerId, project_id: input.projectId, event_type: "QUOTATION_CREATED", title: "Cotización creada.", description: `${quotationNumber} creada correctamente.`, orbit_event_id: input.orbitEventId, actor_id: auth.user.id, actor_label: "Administrador", source: "Administrator", action: "QUOTATION_CREATED", entity_type: "Quotation", entity_id: data.id, human_message: `Cotización ${quotationNumber} creada correctamente.`, correlation_id: correlationId, created_by: auth.user.id });
    if (timelineError) throw timelineError;
    await this.client.from("communications").insert({ customer_id: input.customerId, project_id: input.projectId, channel: "GMAIL", direction: "OUTBOUND", communication_type: "QUOTATION", thread_key: `quotation-${input.projectId}`, subject: `Cotización ${quotationNumber} · BOOMBOX`, body: "Borrador preparado. Requiere confirmación antes de enviar.", status: "DRAFT", created_by: auth.user.id });
    return { id: data.id, quotationNumber, status: "DRAFT", calculation };
  }
}
