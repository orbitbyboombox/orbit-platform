"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCustomerRepository } from "../infrastructure";
import { removeCancelledReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { archiveCancelledReservationDrive, synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { deliverConfirmedReservationEmail,deliverFounderReservationNotification } from "@/features/connectors/google-gmail/application/google-gmail-delivery.service";
import { formalizeManualReservation } from "../signing/manual-reservation-formalization.service";
import type { Project, ProjectDraft } from "../types/project";
import type { CustomerMutationInput } from "../infrastructure";
import{runConfirmedReservationOperationalPipeline}from"../operations/confirmed-reservation-pipeline.service";

export type CreateCustomerResult = { ok: true; project: Project } | { ok: false; error: string };
const safeReservationReference=()=>crypto.randomUUID().replaceAll("-","").slice(0,6).toUpperCase();
const reservationExecutionSteps=["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline","Accounts Receivable","Business Engine","Portal","Google Calendar","Google Drive","Confirmation"]as const;
type ReservationStep=(typeof reservationExecutionSteps)[number];

function reservationErrorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { code: value.code, message: value.message, details: value.details, hint: value.hint };
  }
  return { message: String(error) };
}

export async function createCustomerProjectAction(draft: ProjectDraft): Promise<CreateCustomerResult> {
  const reference=safeReservationReference();const startedAt=Date.now();let currentStep:ReservationStep="Customer Lookup";let diagnosticClient:Awaited<ReturnType<typeof createSupabaseServerClient>>|null=null;let projectId:string|undefined;let customerId:string|undefined;
  const stepState=reservationExecutionSteps.map((label,index)=>({step:`STEP ${index+1}`,label,status:"PENDING"}));
  const mark=(label:ReservationStep,status:"PASS"|"FAIL")=>{const item=stepState.find(entry=>entry.label===label);if(item)item.status=status};
  const log=(label:ReservationStep,status:"PASS"|"FAIL",details?:Record<string,unknown>)=>console.log(JSON.stringify({level:status==="FAIL"?"error":"info",event:"manual_reservation.step",reference,step:label,status,...details,timestamp:new Date().toISOString()}));
  const persistDiagnostic=async(status:"PASS"|"FAIL",error?:unknown)=>{if(!diagnosticClient)return;const details=reservationErrorDetails(error);const rawMessage=String(details.message??"");const tagged=rawMessage.match(/^RC17F\|([^|]+)\|([\s\S]+)$/);if(tagged){currentStep=tagged[1]as ReservationStep;details.message=tagged[2]}if(status==="FAIL")mark(currentStep,"FAIL");const suggestedFix=rawMessage.includes("Datos incompletos")||rawMessage.includes("origen del nuevo cliente")?"Alinear la validación del wizard con la reutilización de clientes CRM; un cliente existente no requiere un nuevo origen.":rawMessage.includes("ambiguous")?"Calificar project_id con el alias de tabla dentro de la función PL/pgSQL.":"Revisar la etapa y restricción exactas registradas antes de reintentar.";const{error:diagnosticError}=await diagnosticClient.rpc("record_reservation_diagnostic",{p_reference:reference,p_status:status,p_failed_step:status==="FAIL"?currentStep:null,p_exception_code:String(details.code??details.name??""),p_exception_message:status==="FAIL"?String(details.message??error):null,p_exception_detail:String(details.details??details.stack??""),p_affected_record:{customerId,projectId,crmCustomerId:draft.crmCustomerId,customerRut:draft.client.rut},p_suggested_fix:status==="FAIL"?suggestedFix:null,p_steps:stepState,p_duration_ms:Date.now()-startedAt});if(diagnosticError)console.error(JSON.stringify({level:"error",event:"manual_reservation.diagnostic_write_failed",reference,error:diagnosticError.message}))};
  try {
    const client = await createSupabaseServerClient();
    diagnosticClient=client;
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    const adjustment = draft.commercialAdjustment;
    const isNegotiated = adjustment?.mode === "NEGOTIATED";
    if (isNegotiated && !["CEO", "ADMINISTRATOR", "SALES"].includes(profile.role)) throw new Error("Solo Administración o Comercial puede aplicar ajustes comerciales.");
    if (isNegotiated && !adjustment.reason.trim()) throw new Error("El motivo de la negociación es obligatorio.");
    const repository = new SupabaseCustomerRepository(client);
    const project = await repository.createWithProject(draft);
    projectId=project.id;for(const label of reservationExecutionSteps.slice(0,5)){mark(label,"PASS");log(label,"PASS",{projectId})}currentStep="Accounts Receivable";
    if (adjustment) {
      const subtotal = Math.max(0, Number(adjustment.subtotal));
      const discount = Math.max(0, Number(adjustment.discountAmount));
      const charges = Math.max(0, Number(adjustment.commercialCharge));
      const courtesyValue = Math.max(0, Number(adjustment.courtesyValue));
      const finalTotal = Math.max(0, Number(adjustment.finalPrice));
      const priceDifference = finalTotal - subtotal;
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
        discount_total: discount + courtesyValue,
        tax_total: adjustment.vatAmount,
        grand_total: finalTotal,
        official_price: subtotal,
        final_customer_price: finalTotal,
        price_difference: priceDifference,
        negotiation_method: adjustment.mode === "NEGOTIATED" ? "MANUAL" : "RESTORE",
        negotiation_value: finalTotal,
        negotiation_reason: adjustment.reason.trim(),
        negotiated_by: auth.user.id,
        negotiated_at: new Date().toISOString(),
        pricing_snapshot: { commercialNegotiation: adjustment, officialPrice: subtotal, officialServicePrice: adjustment.officialServicePrice, officialExtras: adjustment.officialExtras + adjustment.officialVenueSurcharge, officialTransport: adjustment.officialTransport, negotiatedServicePrice: adjustment.negotiatedServicePrice, negotiatedExtras: adjustment.negotiatedExtras, negotiatedTransport: adjustment.negotiatedTransport, negotiatedTotal: adjustment.negotiatedTotal, difference: adjustment.difference, differencePercentage: adjustment.differencePercentage, discount, commercialCharges: charges, courtesyValue, finalTotal, paymentCondition: adjustment.paymentCondition, paymentTermDays: adjustment.paymentTermDays },
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
        const format = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
        const message = `Negociación comercial registrada. Precio oficial ${format.format(subtotal)} · descuento ${format.format(discount)} · cargos ${format.format(charges)} · cortesías ${format.format(courtesyValue)} · precio final ${format.format(finalTotal)} · condición ${adjustment.paymentCondition} · plazo ${adjustment.paymentTermDays} días.`;
        const { error: timelineError } = await client.from("timeline_events").insert({ orbit_event_id: persistedProject.orbit_event_id, project_id: project.id, customer_id: persistedProject.customer_id, event_type: "QUOTATION_UPDATED", title: message, description: message, actor_id: auth.user.id, actor_label: "Administrador", source: "Administrator", action: "QUOTATION_UPDATED", entity_type: "Quotation", entity_id: quotation.id, human_message: message, correlation_id: crypto.randomUUID(), reason: adjustment.reason.trim(), created_by: auth.user.id });
        if (timelineError) throw timelineError;
      }
      if (quotationCreated && quotation && adjustment.mode === "NEGOTIATED") {
        const { error: negotiationAuditError } = await client.from("reservation_commercial_negotiations").insert({
          project_id: project.id,
          customer_id: persistedProject.customer_id,
          quotation_id: quotation.id,
          orbit_event_id: persistedProject.orbit_event_id,
          official_service_price: adjustment.officialServicePrice,
          official_extras_price: adjustment.officialExtras + adjustment.officialVenueSurcharge,
          official_transport_price: adjustment.officialTransport,
          negotiated_service_price: adjustment.negotiatedServicePrice,
          negotiated_extras_price: adjustment.negotiatedExtras,
          negotiated_transport_price: adjustment.negotiatedTransport,
          commercial_charges: adjustment.commercialCharge,
          commercial_discounts: adjustment.discountAmount + adjustment.courtesyValue,
          official_total: adjustment.officialTotal,
          negotiated_total: adjustment.negotiatedTotal,
          difference: adjustment.difference,
          difference_percentage: adjustment.differencePercentage,
          reason: adjustment.reason,
          internal_notes: adjustment.internalNotes ?? null,
          created_by: auth.user.id,
        });
        if (negotiationAuditError) throw negotiationAuditError;
      }
      const { data: currentProject, error: currentProjectError } = await client.from("projects").select("finance,operations").eq("id", project.id).single();
      if (currentProjectError) throw currentProjectError;
      const currentFinance = currentProject.finance && typeof currentProject.finance === "object" ? currentProject.finance as Record<string, unknown> : {};
      const currentOperations = currentProject.operations && typeof currentProject.operations === "object" ? currentProject.operations as Record<string, unknown> : {};
      const negotiatedAt = new Date().toISOString();
      const negotiation = { negotiationMode: adjustment.mode, officialPrice: subtotal, officialServicePrice: adjustment.officialServicePrice, officialExtras: adjustment.officialExtras + adjustment.officialVenueSurcharge, officialTransport: adjustment.officialTransport, negotiatedServicePrice: adjustment.negotiatedServicePrice, negotiatedExtras: adjustment.negotiatedExtras, negotiatedTransport: adjustment.negotiatedTransport, negotiatedTotal: adjustment.negotiatedTotal, commercialDifference: adjustment.difference, commercialDifferencePercentage: adjustment.differencePercentage, commercialDiscount: discount, commercialCharges: charges, courtesyValue, finalPrice: finalTotal, paymentCondition: adjustment.paymentCondition, paymentTermDays: adjustment.paymentTermDays, paymentReceiptRequired: adjustment.paymentReceiptRequired, corporateCreditApproved: adjustment.corporateCreditApproved, corporateVatApplied: adjustment.corporateVatApplied, netAmount: adjustment.netAmount, vatAmount: adjustment.vatAmount, negotiationReason: adjustment.reason, negotiationInternalNotes: adjustment.internalNotes, negotiatedBy: auth.user.id, negotiatedAt };
      const { error: financeError } = await client.from("projects").update({ finance: { ...currentFinance, ...negotiation }, operations: { ...currentOperations, commercialNegotiation: adjustment, paymentClause: adjustment.paymentCondition === "CASH" ? "Pago al contado." : adjustment.paymentCondition === "CORPORATE_CREDIT" ? `Pago a ${adjustment.paymentTermDays} días desde la emisión de la factura.` : "Reserva 50% y saldo antes del evento." }, updated_by: auth.user.id }).eq("id", project.id);
      if (financeError) throw financeError;
    }
    if (draft.commercialFormalization) {
      await formalizeManualReservation({ projectId: project.id, actorId: auth.user.id, formalization: draft.commercialFormalization });
      const { data: persisted, error: persistedError } = await client.from("projects").select("customer_id,orbit_event_id,finance,quotations(id,final_customer_price)").eq("id", project.id).single();
      if (persistedError) throw persistedError;
      const finance = persisted.finance && typeof persisted.finance === "object" ? persisted.finance as Record<string, unknown> : {};
      const formalization = draft.commercialFormalization.type;
      const invoiceRequired = ["CONTRACT_INVOICE", "INVOICE_ONLY", "PURCHASE_ORDER"].includes(formalization);
      const { error: financeUpdateError } = await client.from("projects").update({ finance: { ...finance, commercialFormalization: formalization, documentType: draft.commercialFormalization.documentType, signatureRequired: draft.commercialFormalization.requiresSignature, invoiceRequired }, updated_by: auth.user.id }).eq("id", project.id);
      if (financeUpdateError) throw financeUpdateError;
      if (invoiceRequired) {
        const quotation = Array.isArray(persisted.quotations) ? persisted.quotations[0] : persisted.quotations;
        const termDays = adjustment?.paymentTermDays ?? 0;
        const paymentTerm = termDays === 15 ? "DAYS_15" : termDays === 30 ? "DAYS_30" : termDays === 45 ? "DAYS_45" : termDays === 60 ? "DAYS_60" : "CASH";
        const invoiceNumber = `FAC-${new Date().getFullYear()}-${project.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
        const { error: invoiceError } = await client.from("invoices").upsert({ invoice_number: invoiceNumber, customer_id: persisted.customer_id, project_id: project.id, quotation_id: quotation?.id ?? null, orbit_event_id: persisted.orbit_event_id, customer_type: draft.type === "Corporate" ? "CORPORATE" : "PRIVATE", status: "DRAFT", payment_term: draft.type === "Corporate" ? paymentTerm : "CASH", purchase_order: formalization === "PURCHASE_ORDER" ? "Pendiente de recepción" : null, amount: Number(quotation?.final_customer_price ?? adjustment?.finalPrice ?? 0), notes: `Formalización comercial: ${formalization}`, created_by: auth.user.id, updated_by: auth.user.id }, { onConflict: "invoice_number" });
        if (invoiceError) throw invoiceError;
      }
    }
    const{data:projectIdentity,error:projectIdentityError}=await client.from("projects").select("customer_id").eq("id",project.id).single();if(projectIdentityError)throw projectIdentityError;customerId=projectIdentity.customer_id;mark("Accounts Receivable","PASS");log("Accounts Receivable","PASS",{projectId});
    await runConfirmedReservationOperationalPipeline({client,projectId:project.id,actorId:auth.user.id,onStage:(stage,status)=>{const label=stage==="BUSINESS_ENGINE"?"Business Engine":stage==="GOOGLE_CALENDAR"?"Google Calendar":"Google Drive";currentStep=label;if(status==="PASS"){mark(label,"PASS");log(label,"PASS",{projectId})}}});
    currentStep="Portal";mark("Portal","PASS");log("Portal","PASS",{projectId});
    currentStep="Confirmation";mark("Confirmation","PASS");log("Confirmation","PASS",{projectId});await persistDiagnostic("PASS");
    revalidatePath("/projects");
    revalidatePath("/settings");
    return { ok: true, project };
  } catch (error) {
    await persistDiagnostic("FAIL",error);log(currentStep,"FAIL",{error:reservationErrorDetails(error)});console.error(JSON.stringify({ level: "error", event: "reservation.confirmation.failed",reference,failedStep:currentStep,error:reservationErrorDetails(error), timestamp: new Date().toISOString() }));
    return { ok: false, error: `No se pudo completar la reserva. Tu información fue preservada. Referencia ${reference} · Etapa: ${currentStep}.` };
  }
}

export async function sendManualReservationConfirmationAction(projectId:string):Promise<{ok:boolean;message:string}>{try{const client=await createSupabaseServerClient();const{data:auth,error}=await client.auth.getUser();if(error||!auth.user)throw error??new Error("Sesión requerida.");const result=await deliverConfirmedReservationEmail({projectId,actorId:auth.user.id});if(result.status==="SENT")await deliverFounderReservationNotification({projectId,actorId:auth.user.id});revalidatePath(`/projects/${projectId}`);revalidatePath("/settings");return{ok:true,message:result.status==="SENT"?"Confirmación enviada al cliente y notificación Founder procesada.":"El documento aún no está listo para enviar."};}catch(error){console.error(JSON.stringify({level:"error",event:"manual_reservation.confirmation_send_failed",projectId,error:reservationErrorDetails(error),timestamp:new Date().toISOString()}));return{ok:false,message:`No fue posible enviar la confirmación. Referencia ${safeReservationReference()}`};}}
export async function getManualConfirmationPreviewAction(projectId:string){try{const client=await createSupabaseServerClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Sesión requerida.");const{data,error}=await client.from("projects").select("finance,customers!inner(full_name,email),project_services(service_code),agreements(status),customer_portal_tokens(id)").eq("id",projectId).single();if(error)throw error;const customer=Array.isArray(data.customers)?data.customers[0]:data.customers;const agreement=Array.isArray(data.agreements)?data.agreements.at(-1):data.agreements;const finance=data.finance&&typeof data.finance==="object"?data.finance as Record<string,unknown>:{};return{ok:true as const,preview:{customer:customer.full_name,email:customer.email??"Sin correo",services:(data.project_services??[]).map(item=>item.service_code).join(" + ")||"Sin servicio",negotiation:Number(finance.commercialDiscount??0)>0?`Descuento ${Number(finance.commercialDiscount).toLocaleString("es-CL")}`:"Precio oficial",vat:Number(finance.vatAmount??0),document:agreement?.status==="SIGNED"?"Contrato firmado":"Documento comercial",portal:(data.customer_portal_tokens??[]).length>0?"Portal disponible":"Portal pendiente"}};}catch{return{ok:false as const,message:`No fue posible preparar la vista previa. Referencia ${safeReservationReference()}`};}}

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
    // El evento puede terminar, pero la relación CRM del cliente permanece.
    ["/projects", "/operations", "/finance", "/finance/receivables", "/reports", "/notifications"].forEach(path => revalidatePath(path));
    return { ok: true, message };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible eliminar el cliente." }; }
}
