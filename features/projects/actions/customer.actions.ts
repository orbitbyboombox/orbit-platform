"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCustomerRepository } from "../infrastructure";
import { removeCancelledReservationCalendar, synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { archiveCancelledReservationDrive, synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { deliverConfirmedReservationEmail } from "@/features/connectors/google-gmail/application/google-gmail-delivery.service";
import type { Project, ProjectDraft } from "../types/project";
import type { CustomerMutationInput } from "../infrastructure";

export type CreateCustomerResult = { ok: true; project: Project } | { ok: false; error: string };

function reservationErrorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { code: value.code, message: value.message, details: value.details, hint: value.hint };
  }
  return { message: String(error) };
}

export async function createCustomerProjectAction(draft: ProjectDraft): Promise<CreateCustomerResult> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    const adjustment = draft.commercialAdjustment;
    if (adjustment && !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Administración puede aplicar ajustes comerciales.");
    if (adjustment && !adjustment.reason.trim()) throw new Error("El motivo del descuento es obligatorio.");
    const repository = new SupabaseCustomerRepository(client);
    const project = await repository.createWithProject(draft);
    if (adjustment) {
      const subtotal = Math.max(0, Number(adjustment.subtotal));
      const value = Math.max(0, Number(adjustment.value));
      const discount = Math.min(subtotal, adjustment.type === "PERCENT" ? Math.round(subtotal * Math.min(value, 100) / 100) : value);
      const finalTotal = subtotal - discount;
      const { data: persistedProject, error: projectError } = await client.from("projects").select("id,customer_id,orbit_event_id").eq("id", project.id).single();
      if (projectError) throw projectError;
      const today = new Date();
      const expiration = new Date(today); expiration.setDate(expiration.getDate() + 7);
      const quotationNumber = `COT-${today.getFullYear()}-${project.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
      const { data: existingQuotation, error: quotationLookupError } = await client.from("quotations").select("id").eq("quotation_number", quotationNumber).maybeSingle();
      if (quotationLookupError) throw quotationLookupError;
      let quotation = existingQuotation;
      let quotationCreated = false;
      if (!quotation) {
        const { data, error: quotationError } = await client.from("quotations").insert({
        quotation_number: quotationNumber,
        customer_id: persistedProject.customer_id,
        project_id: project.id,
        orbit_event_id: persistedProject.orbit_event_id,
        status: "DRAFT",
        customer_type: draft.type === "Corporate" ? "COMPANY" : "PRIVATE",
        event_type: draft.type,
        issue_date: today.toISOString().slice(0, 10),
        expiration_date: expiration.toISOString().slice(0, 10),
        subtotal,
        transport_total: 0,
        discount_total: discount,
        tax_total: 0,
        grand_total: finalTotal,
        official_price: subtotal,
        final_customer_price: finalTotal,
        price_difference: -discount,
        negotiation_method: adjustment.type === "PERCENT" ? "PERCENT_DISCOUNT" : "FIXED_DISCOUNT",
        negotiation_value: value,
        negotiation_reason: adjustment.reason.trim(),
        negotiated_by: auth.user.id,
        negotiated_at: new Date().toISOString(),
        pricing_snapshot: { commercialAdjustment: adjustment, discount, finalTotal },
        blockers: [],
        created_by: auth.user.id,
        updated_by: auth.user.id,
        approval_reason: adjustment.reason.trim(),
        }).select("id").single();
        if (quotationError) throw quotationError;
        quotation = data;
        quotationCreated = true;
      }
      if (quotationCreated && quotation) {
        const message = `Descuento comercial de ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(discount)} aplicado. Motivo: ${adjustment.reason.trim()}`;
        const { error: timelineError } = await client.from("timeline_events").insert({ orbit_event_id: persistedProject.orbit_event_id, project_id: project.id, customer_id: persistedProject.customer_id, event_type: "QUOTATION_UPDATED", title: message, description: message, actor_id: auth.user.id, actor_label: "Administrador", source: "Administrator", action: "QUOTATION_UPDATED", entity_type: "Quotation", entity_id: quotation.id, human_message: message, correlation_id: crypto.randomUUID(), reason: adjustment.reason.trim(), created_by: auth.user.id });
        if (timelineError) throw timelineError;
      }
    }
    await Promise.all([
      synchronizeConfirmedReservationCalendar({ client, projectId: project.id, actorId: auth.user.id }),
      synchronizeConfirmedReservationDrive({ client, projectId: project.id, actorId: auth.user.id }),
    ]);
    await deliverConfirmedReservationEmail({ projectId: project.id, actorId: auth.user.id });
    revalidatePath("/projects");
    return { ok: true, project };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "reservation.confirmation.failed", error: reservationErrorDetails(error), timestamp: new Date().toISOString() }));
    return { ok: false, error: "No pudimos confirmar la reserva. Revisa los datos e inténtalo nuevamente. Si el problema continúa, contacta al administrador de ORBIT." };
  }
}

async function customerRepository() {
  return new SupabaseCustomerRepository(await createSupabaseServerClient());
}

export async function updateCustomerAction(input: CustomerMutationInput): Promise<{ ok: boolean; error?: string }> {
  try { const client=await createSupabaseServerClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Sesión requerida.");await new SupabaseCustomerRepository(client).update(input);if(input.fullName!==undefined){const{data:projects,error}=await client.from("projects").select("id").eq("customer_id",input.customerId).is("deleted_at",null);if(error)throw error;await Promise.all((projects??[]).map(project=>synchronizeConfirmedReservationDrive({client,projectId:project.id,actorId:auth.user.id})));} revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar el cliente." }; }
}

export async function softDeleteCustomerAction(customerId: string, expectedVersion: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await (await customerRepository()).softDelete(customerId, expectedVersion, reason); revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible eliminar el cliente." }; }
}

export async function restoreCustomerAction(customerId: string, expectedVersion: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await (await customerRepository()).restore(customerId, expectedVersion, reason); revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible restaurar el cliente." }; }
}

export async function softDeleteCustomerByProjectAction(projectId: string, reason: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data, error } = await client.from("projects").select("customer_id,orbit_event_id,finance").eq("id", projectId).is("deleted_at", null).single();
    if (error || !data) throw error ?? new Error("No encontramos el cliente del evento.");
    await Promise.all([
      removeCancelledReservationCalendar({ client, projectId, actorId: auth.user.id }),
      archiveCancelledReservationDrive({ client, projectId, actorId: auth.user.id }),
    ]);
    const cancelledAt = new Date().toISOString();
    const finance = data.finance && typeof data.finance === "object" ? data.finance as Record<string, unknown> : {};
    const [projectUpdate, portalUpdate, quotationUpdate, invoiceUpdate, otherProjects] = await Promise.all([
      client.from("projects").update({ status: "CANCELLED", health: "BLOCKED", finance: { ...finance, status: "CANCELLED", cancelledAt }, approval_reason: reason, deleted_at: cancelledAt, deleted_by: auth.user.id, updated_by: auth.user.id }).eq("id", projectId),
      client.from("customer_portal_tokens").update({ revoked_at: cancelledAt, updated_by: auth.user.id }).eq("project_id", projectId).is("revoked_at", null),
      client.from("quotations").update({ approval_reason: reason, deleted_at: cancelledAt, deleted_by: auth.user.id, updated_by: auth.user.id }).eq("project_id", projectId).is("deleted_at", null),
      client.from("invoices").update({ status: "CANCELLED", approval_reason: reason, updated_by: auth.user.id }).eq("project_id", projectId).is("deleted_at", null).neq("status", "PAID"),
      client.from("projects").select("id", { count: "exact", head: true }).eq("customer_id", data.customer_id).neq("id", projectId).is("deleted_at", null),
    ]);
    if (projectUpdate.error) throw projectUpdate.error;
    if (portalUpdate.error) throw portalUpdate.error;
    if (quotationUpdate.error) throw quotationUpdate.error;
    if (invoiceUpdate.error) throw invoiceUpdate.error;
    if (otherProjects.error) throw otherProjects.error;
    const message = "Reserva cancelada y sincronizada: Calendar eliminado, Drive archivado, Portal desactivado y estados operacionales actualizados.";
    const { error: timelineError } = await client.from("timeline_events").insert({ customer_id: data.customer_id, project_id: projectId, orbit_event_id: data.orbit_event_id, event_type: "RESERVATION_CANCELLED_AND_SYNCHRONIZED", title: "Reserva cancelada y sincronizada", description: message, actor_id: auth.user.id, actor_label: "Administrador", source: "Administrator", action: "RESERVATION_CANCELLED", entity_type: "Project", entity_id: projectId, human_message: message, correlation_id: `reservation:${data.orbit_event_id}:cancelled:${crypto.randomUUID()}`, reason, created_by: auth.user.id });
    if (timelineError) throw timelineError;
    if ((otherProjects.count ?? 0) === 0) {
      const { data: currentCustomer, error: currentCustomerError } = await client.from("customers").select("version").eq("id", data.customer_id).single();
      if (currentCustomerError) throw currentCustomerError;
      await new SupabaseCustomerRepository(client).softDelete(data.customer_id, Number(currentCustomer.version), reason);
    }
    ["/projects", "/operations", "/finance", "/finance/receivables", "/reports", "/notifications"].forEach(path => revalidatePath(path));
    return { ok: true, message };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible eliminar el cliente." }; }
}
