"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCustomerRepository } from "../infrastructure";
import { removeCancelledReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import {
  archiveCancelledReservationDrive,
  synchronizeConfirmedReservationDrive,
} from "@/features/connectors/google-drive/application/google-drive-sync.service";
import {
  loadReservationConfirmationComposer,
  sendReservationConfirmation,
} from "@/features/connectors/google-gmail/application/reservation-confirmation.service";
import { formalizeManualReservation } from "../signing/manual-reservation-formalization.service";
import type { Project, ProjectDraft } from "../types/project";
import type { CustomerMutationInput } from "../infrastructure";
import {
  confirmPersistedReservation,
  type ConfirmationStage,
} from "../operations/confirmed-reservation-orchestrator.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import { normalizeOptionalEmail, normalizeRequiredEmail } from "@/lib/email/recipients";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { assertCorporateCreditTerms } from "@/features/accounts-receivable/corporate-credit-terms";

export type CreateCustomerResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };
const safeReservationReference = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
const reservationExecutionSteps = [
  "Customer Lookup",
  "Customer Create / Reuse",
  "Project Create",
  "Event Create",
  "Timeline",
  "Accounts Receivable",
  "Reservation Records",
  "Business Engine",
  "Portal",
  "Google Calendar",
  "Google Drive",
  "Customer Email",
  "Founder Email",
  "Dashboard",
  "Confirmation",
] as const;
type ReservationStep = (typeof reservationExecutionSteps)[number];

function reservationErrorDetails(error: unknown) {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return {
      code: value.code,
      message: value.message,
      details: value.details,
      hint: value.hint,
    };
  }
  return { message: String(error) };
}

export async function createCustomerProjectAction(
  draft: ProjectDraft,
): Promise<CreateCustomerResult> {
  try {
    draft = {
      ...draft,
      client: {
        ...draft.client,
        email: draft.crmCustomerId
          ? (normalizeOptionalEmail(draft.client.email, "email principal") ?? "")
          : normalizeRequiredEmail(draft.client.email, "email principal"),
        secondaryEmail:
          normalizeOptionalEmail(
            draft.client.secondaryEmail,
            "email secundario / CC",
          ) ?? "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Los correos no son válidos.",
    };
  }
  try {
    if (draft.commercialAdjustment)
      assertCorporateCreditTerms({
        paymentCondition: draft.commercialAdjustment.paymentCondition,
        paymentTermDays: draft.commercialAdjustment.paymentTermDays,
        approved: draft.commercialAdjustment.corporateCreditApproved,
      });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "La condición de crédito Empresa no es válida.",
    };
  }
  const reference = safeReservationReference();
  const transactionId = draft.reservationTransactionId;
  const startedAt = Date.now();
  let currentStep: ReservationStep = "Customer Lookup";
  let diagnosticClient: Awaited<
    ReturnType<typeof createSupabaseServerClient>
  > | null = null;
  let projectId: string | undefined;
  let customerId: string | undefined;
  const stepState = reservationExecutionSteps.map((label, index) => ({
    step: `STEP ${index + 1}`,
    label,
    status: "PENDING",
  }));
  const mark = (label: ReservationStep, status: "PASS" | "FAIL") => {
    const item = stepState.find((entry) => entry.label === label);
    if (item) item.status = status;
  };
  const log = (
    label: ReservationStep,
    status: "PASS" | "FAIL",
    details?: Record<string, unknown>,
  ) =>
    console.log(
      JSON.stringify({
        level: status === "FAIL" ? "error" : "info",
        event: "manual_reservation.step",
        reference,
        step: label,
        status,
        ...details,
        timestamp: new Date().toISOString(),
      }),
    );
  const persistDiagnostic = async (
    status: "PASS" | "FAIL",
    error?: unknown,
  ) => {
    if (!diagnosticClient) return;
    const details = reservationErrorDetails(error);
    const rawMessage = String(details.message ?? "");
    const tagged = rawMessage.match(/^RC17F\|([^|]+)\|([\s\S]+)$/);
    if (tagged) {
      currentStep = tagged[1] as ReservationStep;
      details.message = tagged[2];
    }
    if (status === "FAIL") mark(currentStep, "FAIL");
    const suggestedFix =
      rawMessage.includes("Datos incompletos") ||
      rawMessage.includes("origen del nuevo cliente")
        ? "Alinear la validación del wizard con la reutilización de clientes CRM; un cliente existente no requiere un nuevo origen."
        : rawMessage.includes("ambiguous")
          ? "Calificar project_id con el alias de tabla dentro de la función PL/pgSQL."
          : "Revisar la etapa y restricción exactas registradas antes de reintentar.";
    const { error: diagnosticError } = await diagnosticClient.rpc(
      "record_reservation_diagnostic",
      {
        p_reference: reference,
        p_status: status,
        p_failed_step: status === "FAIL" ? currentStep : null,
        p_exception_code: String(details.code ?? details.name ?? ""),
        p_exception_message:
          status === "FAIL" ? String(details.message ?? error) : null,
        p_exception_detail: String(details.details ?? details.stack ?? ""),
        p_affected_record: {
          customerId,
          projectId,
          crmCustomerId: draft.crmCustomerId,
          customerRut: draft.client.rut,
        },
        p_suggested_fix: status === "FAIL" ? suggestedFix : null,
        p_steps: stepState,
        p_duration_ms: Date.now() - startedAt,
      },
    );
    if (diagnosticError)
      console.error(
        JSON.stringify({
          level: "error",
          event: "manual_reservation.diagnostic_write_failed",
          reference,
          error: diagnosticError.message,
        }),
      );
  };
  try {
    const client = await createSupabaseServerClient();
    diagnosticClient = client;
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    if (!transactionId) throw new Error("La reserva no tiene Transaction ID.");
    const checkpoint = async (
      step: ReservationStep,
      status: "PASS" | "FAIL",
      message?: string,
    ) => {
      const { error } = await client.rpc("checkpoint_reservation_transaction", {
        p_transaction_id: transactionId,
        p_step: step,
        p_status: status,
        p_error: message ?? null,
      });
      if (error) throw error;
    };
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .single();
    if (profileError) throw profileError;
    const adjustment = draft.commercialAdjustment;
    const isNegotiated = adjustment?.mode === "NEGOTIATED";
    if (
      isNegotiated &&
      !["CEO", "ADMINISTRATOR", "SALES"].includes(profile.role)
    )
      throw new Error(
        "Solo Administración o Comercial puede aplicar ajustes comerciales.",
      );
    if (isNegotiated && !adjustment.reason.trim())
      throw new Error("El motivo de la negociación es obligatorio.");
    const repository = new SupabaseCustomerRepository(client);
    const project = await repository.createWithProject(draft);
    const { data: transaction, error: transactionError } = await client
      .from("reservation_transactions")
      .select("completed_steps,status")
      .eq("id", transactionId)
      .single();
    if (transactionError) throw transactionError;
    const completedSteps = new Set<string>(
      Array.isArray(transaction.completed_steps)
        ? transaction.completed_steps.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    );
    if (transaction.status === "COMPLETED") {
      revalidatePath("/projects");
      return { ok: true, project: { ...project, reservationResumed: true } };
    }
    let preparedPortal: { url: string; expiresAt: string } | undefined;
    projectId = project.id;
    for (const label of reservationExecutionSteps.slice(0, 5)) {
      mark(label, "PASS");
      log(label, "PASS", { projectId });
    }
    currentStep = "Accounts Receivable";
    if (adjustment && !completedSteps.has("Accounts Receivable")) {
      const subtotal = Math.max(0, Number(adjustment.subtotal));
      const discount = Math.max(0, Number(adjustment.discountAmount));
      const charges = Math.max(0, Number(adjustment.commercialCharge));
      const courtesyValue = Math.max(0, Number(adjustment.courtesyValue));
      const finalTotal = Math.max(0, Number(adjustment.finalPrice));
      const priceDifference = finalTotal - subtotal;
      const { data: persistedProject, error: projectError } = await client
        .from("projects")
        .select("id,customer_id,orbit_event_id")
        .eq("id", project.id)
        .single();
      if (projectError) throw projectError;
      const today = new Date();
      const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(today);
      const expiration = new Date(today);
      expiration.setDate(expiration.getDate() + 7);
      const quotationLookup = draft.commercialSourceQuotationId
        ? client.from("quotations").select("id").eq("id", draft.commercialSourceQuotationId).eq("status", "ACCEPTED").maybeSingle()
        : client.from("quotations").select("id").eq("project_id", project.id).is("deleted_at", null).maybeSingle();
      const { data: existingQuotation, error: quotationLookupError } = await quotationLookup;
      if (quotationLookupError) throw quotationLookupError;
      let quotation = existingQuotation;
      const pricingSnapshot = {
        commercialNegotiation: adjustment,
        officialPrice: subtotal,
        officialServicePrice: adjustment.officialServicePrice,
        officialExtras:
          adjustment.officialExtras + adjustment.officialVenueSurcharge,
        officialTransport: adjustment.officialTransport,
        negotiatedServicePrice: adjustment.negotiatedServicePrice,
        negotiatedExtras: adjustment.negotiatedExtras,
        negotiatedTransport: adjustment.negotiatedTransport,
        negotiatedTotal: adjustment.negotiatedTotal,
        difference: adjustment.difference,
        differencePercentage: adjustment.differencePercentage,
        discount,
        commercialCharges: charges,
        courtesyValue,
        finalTotal,
        paymentCondition: adjustment.paymentCondition,
        paymentTermDays: adjustment.paymentTermDays,
      };
      if (draft.commercialSourceQuotationId && !quotation) throw new Error("La cotización comercial debe estar ACEPTADA antes de convertirla en reserva.");
      if (!quotation) {
        const quotationId = crypto.randomUUID();
        const { data: quotationNumber, error: allocationError } = await client.rpc("allocate_quotation_number", { p_quotation_id: quotationId, p_issue_date: issueDate });
        if (allocationError || !quotationNumber) throw allocationError ?? new Error("No fue posible asignar el número de cotización.");
        const { data, error: quotationError } = await client
          .from("quotations")
          .insert({
            id: quotationId,
            quotation_number: quotationNumber,
            customer_id: persistedProject.customer_id,
            project_id: project.id,
            orbit_event_id: persistedProject.orbit_event_id,
            status: "DRAFT",
            customer_type: draft.type === "Corporate" ? "COMPANY" : "PRIVATE",
            event_type: draft.type,
            issue_date: issueDate,
            expiration_date: expiration.toISOString().slice(0, 10),
            subtotal,
            transport_total: 0,
            discount_total: discount + courtesyValue,
            tax_total: adjustment.vatAmount,
            grand_total: finalTotal,
            official_price: subtotal,
            final_customer_price: finalTotal,
            price_difference: priceDifference,
            negotiation_method:
              adjustment.mode === "NEGOTIATED" ? "MANUAL" : "RESTORE",
            negotiation_value: finalTotal,
            negotiation_reason: adjustment.reason.trim(),
            negotiated_by: auth.user.id,
            negotiated_at: new Date().toISOString(),
            pricing_snapshot: pricingSnapshot,
            blockers: [],
            created_by: auth.user.id,
            updated_by: auth.user.id,
            approval_reason: adjustment.reason.trim(),
          })
          .select("id")
          .single();
        if (quotationError) throw quotationError;
        quotation = data;
      } else if (!draft.commercialSourceQuotationId) {
        const { error: quotationUpdateError } = await client
          .from("quotations")
          .update({
            subtotal,
            discount_total: discount + courtesyValue,
            tax_total: adjustment.vatAmount,
            grand_total: finalTotal,
            official_price: subtotal,
            final_customer_price: finalTotal,
            price_difference: priceDifference,
            negotiation_value: finalTotal,
            negotiation_reason: adjustment.reason.trim(),
            pricing_snapshot: pricingSnapshot,
            updated_by: auth.user.id,
          })
          .eq("id", quotation.id)
          .eq("status", "DRAFT");
        if (quotationUpdateError) throw quotationUpdateError;
      }
      if (quotation) {
        if (draft.commercialSourceQuotationId) {
          const { error: sourceLinkError } = await client.from("quotations").update({ customer_id: persistedProject.customer_id, project_id: project.id, orbit_event_id: persistedProject.orbit_event_id, updated_by: auth.user.id }).eq("id", quotation.id);
          if (sourceLinkError) throw sourceLinkError;
        }
        const format = new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          maximumFractionDigits: 0,
        });
        const message = `Precio aplicado registrado. Servicio ${format.format(adjustment.negotiatedServicePrice)} · extras ${format.format(adjustment.negotiatedExtras)} · transporte ${format.format(adjustment.negotiatedTransport)} · total ${format.format(finalTotal)} · condición ${adjustment.paymentCondition} · plazo ${adjustment.paymentTermDays} días.`;
        const { count: timelineCount, error: timelineLookupError } = await client
          .from("timeline_events")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("entity_id", quotation.id)
          .eq("action", "QUOTATION_UPDATED");
        if (timelineLookupError) throw timelineLookupError;
        const { error: timelineError } = timelineCount
          ? { error: null }
          : await client.from("timeline_events").insert({
            orbit_event_id: persistedProject.orbit_event_id,
            project_id: project.id,
            customer_id: persistedProject.customer_id,
            event_type: "QUOTATION_UPDATED",
            title: message,
            description: message,
            actor_id: auth.user.id,
            actor_label: "Administrador",
            source: "Administrator",
            action: "QUOTATION_UPDATED",
            entity_type: "Quotation",
            entity_id: quotation.id,
            human_message: message,
            correlation_id: transactionId,
            reason: adjustment.reason.trim(),
            created_by: auth.user.id,
          });
        if (timelineError) throw timelineError;
      }
      if (quotation && adjustment.mode === "NEGOTIATED") {
        const { count: negotiationCount, error: negotiationLookupError } =
          await client
            .from("reservation_commercial_negotiations")
            .select("id", { count: "exact", head: true })
            .eq("project_id", project.id)
            .eq("quotation_id", quotation.id);
        if (negotiationLookupError) throw negotiationLookupError;
        const { error: negotiationAuditError } = negotiationCount
          ? { error: null }
          : await client.from("reservation_commercial_negotiations").insert({
            project_id: project.id,
            customer_id: persistedProject.customer_id,
            quotation_id: quotation.id,
            orbit_event_id: persistedProject.orbit_event_id,
            official_service_price: adjustment.officialServicePrice,
            official_extras_price:
              adjustment.officialExtras + adjustment.officialVenueSurcharge,
            official_transport_price: adjustment.officialTransport,
            negotiated_service_price: adjustment.negotiatedServicePrice,
            negotiated_extras_price: adjustment.negotiatedExtras,
            negotiated_transport_price: adjustment.negotiatedTransport,
            commercial_charges: adjustment.commercialCharge,
            commercial_discounts:
              adjustment.discountAmount + adjustment.courtesyValue,
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
      const { data: currentProject, error: currentProjectError } = await client
        .from("projects")
        .select("finance,operations")
        .eq("id", project.id)
        .single();
      if (currentProjectError) throw currentProjectError;
      const currentFinance =
        currentProject.finance && typeof currentProject.finance === "object"
          ? (currentProject.finance as Record<string, unknown>)
          : {};
      const currentOperations =
        currentProject.operations &&
        typeof currentProject.operations === "object"
          ? (currentProject.operations as Record<string, unknown>)
          : {};
      const negotiatedAt = new Date().toISOString();
      const negotiation = {
        negotiationMode: adjustment.mode,
        officialPrice: subtotal,
        officialServicePrice: adjustment.officialServicePrice,
        officialExtras:
          adjustment.officialExtras + adjustment.officialVenueSurcharge,
        officialTransport: adjustment.officialTransport,
        negotiatedServicePrice: adjustment.negotiatedServicePrice,
        negotiatedExtras: adjustment.negotiatedExtras,
        negotiatedTransport: adjustment.negotiatedTransport,
        negotiatedTotal: adjustment.negotiatedTotal,
        commercialDifference: adjustment.difference,
        commercialDifferencePercentage: adjustment.differencePercentage,
        commercialDiscount: discount,
        commercialCharges: charges,
        courtesyValue,
        finalPrice: finalTotal,
        paymentCondition: adjustment.paymentCondition,
        paymentTermDays: adjustment.paymentTermDays,
        paymentReceiptRequired: adjustment.paymentReceiptRequired,
        corporateCreditApproved: adjustment.corporateCreditApproved,
        corporateVatApplied: adjustment.corporateVatApplied,
        netAmount: adjustment.netAmount,
        vatAmount: adjustment.vatAmount,
        negotiationReason: adjustment.reason,
        negotiationInternalNotes: adjustment.internalNotes,
        negotiatedBy: auth.user.id,
        negotiatedAt,
      };
      const { error: financeError } = await client
        .from("projects")
        .update({
          finance: { ...currentFinance, ...negotiation },
          operations: {
            ...currentOperations,
            commercialNegotiation: adjustment,
            paymentClause:
              adjustment.paymentCondition === "CASH"
                ? "Pago al contado."
                : adjustment.paymentCondition === "CORPORATE_CREDIT"
                  ? `Pago a ${adjustment.paymentTermDays} días desde la emisión de la factura.`
                  : "Reserva 50% y saldo antes del evento.",
          },
          updated_by: auth.user.id,
        })
        .eq("id", project.id);
      if (financeError) throw financeError;
    }
    if (
      draft.commercialFormalization &&
      !completedSteps.has("Accounts Receivable")
    ) {
      const { count: existingAgreementCount, error: agreementLookupError } =
        await client
          .from("agreements")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id);
      if (agreementLookupError) throw agreementLookupError;
      if (!existingAgreementCount) {
        const result = await formalizeManualReservation({
          projectId: project.id,
          actorId: auth.user.id,
          formalization: draft.commercialFormalization,
        });
        preparedPortal = {
          url: "url" in result ? result.url : result.portalUrl,
          expiresAt: "expiresAt" in result ? result.expiresAt : "",
        };
      }
      const { data: persisted, error: persistedError } = await client
        .from("projects")
        .select(
          "customer_id,orbit_event_id,finance,quotations(id,final_customer_price)",
        )
        .eq("id", project.id)
        .single();
      if (persistedError) throw persistedError;
      const finance =
        persisted.finance && typeof persisted.finance === "object"
          ? (persisted.finance as Record<string, unknown>)
          : {};
      const formalization = draft.commercialFormalization.type;
      const invoiceRequired = [
        "CONTRACT_INVOICE",
        "INVOICE_ONLY",
        "PURCHASE_ORDER",
      ].includes(formalization);
      const { error: financeUpdateError } = await client
        .from("projects")
        .update({
          finance: {
            ...finance,
            commercialFormalization: formalization,
            documentType: draft.commercialFormalization.documentType,
            signatureRequired: draft.commercialFormalization.requiresSignature,
            invoiceRequired,
          },
          updated_by: auth.user.id,
        })
        .eq("id", project.id);
      if (financeUpdateError) throw financeUpdateError;
      if (invoiceRequired) {
        const { error: invoiceError } = await client.rpc(
          "sync_project_receivable_terms",
          { p_project_id: project.id },
        );
        if (invoiceError) throw invoiceError;
      }
    }
    const { data: projectIdentity, error: projectIdentityError } = await client
      .from("projects")
      .select("customer_id")
      .eq("id", project.id)
      .single();
    if (projectIdentityError) throw projectIdentityError;
    customerId = projectIdentity.customer_id;
    mark("Accounts Receivable", "PASS");
    log("Accounts Receivable", "PASS", { projectId });
    if (!completedSteps.has("Accounts Receivable"))
      await checkpoint("Accounts Receivable", "PASS");
    const completedStages = new Set<ConfirmationStage>();
    if (completedSteps.has("Business Engine"))
      completedStages.add("BUSINESS_ENGINE");
    if (completedSteps.has("Google Calendar"))
      completedStages.add("GOOGLE_CALENDAR");
    if (completedSteps.has("Google Drive")) completedStages.add("GOOGLE_DRIVE");
    if (completedSteps.has("Portal")) completedStages.add("PORTAL");
    if (completedSteps.has("Customer Email"))
      completedStages.add("CUSTOMER_EMAIL");
    if (completedSteps.has("Founder Email"))
      completedStages.add("FOUNDER_EMAIL");
    if (completedSteps.has("Dashboard")) completedStages.add("DASHBOARD");
    if (completedSteps.has("Reservation Records"))
      completedStages.add("RECORDS");
    await confirmPersistedReservation({
      client,
      projectId: project.id,
      actorId: auth.user.id,
      portal: preparedPortal,
      completedStages,
      onStage: async (stage, status) => {
        const label =
          stage === "RECORDS"
            ? "Reservation Records"
            : stage === "BUSINESS_ENGINE"
            ? "Business Engine"
            : stage === "GOOGLE_CALENDAR"
              ? "Google Calendar"
              : stage === "GOOGLE_DRIVE"
                ? "Google Drive"
                : stage === "PORTAL"
                  ? "Portal"
                  : stage === "CUSTOMER_EMAIL"
                    ? "Customer Email"
                    : stage === "FOUNDER_EMAIL"
                      ? "Founder Email"
                      : "Dashboard";
        currentStep = label;
        if (status === "PASS") {
          mark(label, "PASS");
          log(label, "PASS", { projectId });
          await checkpoint(label, "PASS");
        }
      },
    });
    currentStep = "Confirmation";
    mark("Confirmation", "PASS");
    log("Confirmation", "PASS", { projectId });
    await checkpoint("Confirmation", "PASS");
    await persistDiagnostic("PASS");
    revalidatePath("/projects");
    revalidatePath("/settings");
    return { ok: true, project };
  } catch (error) {
    if (diagnosticClient && transactionId) {
      const details = reservationErrorDetails(error);
      await diagnosticClient.rpc("checkpoint_reservation_transaction", {
        p_transaction_id: transactionId,
        p_step: currentStep,
        p_status: "FAIL",
        p_error: String(details.message ?? error),
      });
    }
    await persistDiagnostic("FAIL", error);
    log(currentStep, "FAIL", {
      error: reservationErrorDetails(error),
      transactionId,
    });
    console.error(
      JSON.stringify({
        level: "error",
        event: "reservation.confirmation.failed",
        reference,
        transactionId,
        failedStep: currentStep,
        error: reservationErrorDetails(error),
        timestamp: new Date().toISOString(),
      }),
    );
    const partialReceivableFailure =
      Boolean(projectId) && currentStep === "Accounts Receivable";
    return {
      ok: false,
      error: partialReceivableFailure
        ? `Reserva creada. Cuenta por cobrar pendiente de sincronización. Tu información fue preservada. Referencia ${reference} · Etapa: ${currentStep}.`
        : `No se pudo completar la reserva. Tu información fue preservada. Referencia ${reference} · Etapa: ${currentStep}.`,
    };
  }
}

async function requireReservationCommunicationFounder() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile.role))
    throw new Error("Solo Founder o Administración puede enviar confirmaciones.");
  return auth.user.id;
}

export async function sendManualReservationConfirmationAction(formData: FormData) {
  try {
    const actorId = await requireReservationCommunicationFounder();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!projectId || !requestId) throw new Error("El intento de envío no es válido.");
    const result = await sendReservationConfirmation({
      projectId,
      actorId,
      requestId,
      to: String(formData.get("to") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      cc: String(formData.get("cc") ?? ""),
      confirmResend: formData.get("confirmResend") === "true",
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/customers");
    if (result.status !== "SENT") {
      return {
        ok: false as const,
        ...result,
        message: "No se pudo enviar la confirmación.",
        error: "El intento ya está pendiente o falló. Usa Reintentar para crear un nuevo intento.",
      };
    }
    return {
      ok: true as const,
      ...result,
      message: `✓ Confirmación enviada a ${result.recipient}`,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "manual_reservation.confirmation_send_failed",
        projectId: String(formData.get("projectId") ?? ""),
        error: reservationErrorDetails(error),
        timestamp: new Date().toISOString(),
      }),
    );
    return {
      ok: false as const,
      message: "No se pudo enviar la confirmación.",
      error: error instanceof Error ? error.message : "Falla desconocida del proveedor.",
    };
  }
}
export async function getManualConfirmationPreviewAction(projectId: string) {
  try {
    await requireReservationCommunicationFounder();
    const preview = await loadReservationConfirmationComposer(projectId);
    return {
      ok: true as const,
      preview,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No fue posible preparar la vista previa.",
    };
  }
}

async function customerRepository() {
  return new SupabaseCustomerRepository(await createSupabaseServerClient());
}

export async function updateCustomerAction(
  input: CustomerMutationInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    await new SupabaseCustomerRepository(client).update(input);
    if (input.fullName !== undefined) {
      const { data: projects, error } = await client
        .from("projects")
        .select("id")
        .eq("customer_id", input.customerId)
        .is("deleted_at", null);
      if (error) throw error;
      await Promise.all(
        (projects ?? []).map((project) =>
          synchronizeConfirmedReservationDrive({
            client,
            projectId: project.id,
            actorId: auth.user.id,
          }),
        ),
      );
    }
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible actualizar el cliente.",
    };
  }
}

export async function softDeleteCustomerAction(
  customerId: string,
  expectedVersion: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await (
      await customerRepository()
    ).softDelete(customerId, expectedVersion, reason);
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible eliminar el cliente.",
    };
  }
}

export async function restoreCustomerAction(
  customerId: string,
  expectedVersion: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await (
      await customerRepository()
    ).restore(customerId, expectedVersion, reason);
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible restaurar el cliente.",
    };
  }
}

export async function softDeleteCustomerByProjectAction(
  projectId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data, error } = await client
      .from("projects")
      .select("customer_id,orbit_event_id,finance")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (error || !data)
      throw error ?? new Error("No encontramos el cliente del evento.");
    const { data: activeAssignments, error: assignmentLoadError } = await client
      .from("assignments")
      .select("id")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .not("status", "in", "(CANCELLED,REJECTED,COMPLETED)");
    if (assignmentLoadError) throw assignmentLoadError;
    const cancellationIds: string[] = [];
    for (const assignment of activeAssignments ?? []) {
      const { data: cancellationId, error: cancellationError } = await client.rpc(
        "cancel_staff_assignment_by_founder",
        {
          p_assignment_id: assignment.id,
          p_reason_category: "OPERATIONAL",
          p_reason_detail: reason,
          p_device: null,
          p_ip_hash: null,
          p_user_agent: null,
        },
      );
      if (cancellationError || !cancellationId)
        throw cancellationError ?? new Error("No fue posible cancelar el Staff confirmado.");
      const { error: republishError } = await client
        .from("staff_assignment_cancellations")
        .update({ republish_allowed: false })
        .eq("id", cancellationId);
      if (republishError) throw republishError;
      cancellationIds.push(String(cancellationId));
    }
    const cancelledAt = new Date().toISOString();
    const finance =
      data.finance && typeof data.finance === "object"
        ? (data.finance as Record<string, unknown>)
        : {};
    const [
      projectUpdate,
      portalUpdate,
      quotationUpdate,
      invoiceUpdate,
      otherProjects,
      publicationUpdate,
      requirementUpdate,
      requestUpdate,
    ] = await Promise.all([
      client
        .from("projects")
        .update({
          status: "CANCELLED",
          health: "BLOCKED",
          finance: { ...finance, status: "CANCELLED", cancelledAt },
          approval_reason: reason,
          deleted_at: cancelledAt,
          deleted_by: auth.user.id,
          updated_by: auth.user.id,
        })
        .eq("id", projectId),
      client
        .from("customer_portal_tokens")
        .update({ revoked_at: cancelledAt, updated_by: auth.user.id })
        .eq("project_id", projectId)
        .is("revoked_at", null),
      client
        .from("quotations")
        .update({
          approval_reason: reason,
          deleted_at: cancelledAt,
          deleted_by: auth.user.id,
          updated_by: auth.user.id,
        })
        .eq("project_id", projectId)
        .is("deleted_at", null),
      client
        .from("invoices")
        .update({
          status: "CANCELLED",
          approval_reason: reason,
          updated_by: auth.user.id,
        })
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .neq("status", "PAID"),
      client
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", data.customer_id)
        .neq("id", projectId)
        .is("deleted_at", null),
      client
        .from("staff_event_publications")
        .update({ published: false, updated_at: cancelledAt })
        .eq("project_id", projectId),
      client
        .from("event_staff_requirements")
        .update({ published: false, updated_at: cancelledAt, updated_by: auth.user.id })
        .eq("project_id", projectId),
      client
        .from("staff_assignment_requests")
        .update({ status: "CANCELLED", reviewed_at: cancelledAt, reviewed_by: auth.user.id })
        .eq("project_id", projectId)
        .eq("status", "PENDING"),
    ]);
    if (projectUpdate.error) throw projectUpdate.error;
    if (portalUpdate.error) throw portalUpdate.error;
    if (quotationUpdate.error) throw quotationUpdate.error;
    if (invoiceUpdate.error) throw invoiceUpdate.error;
    if (otherProjects.error) throw otherProjects.error;
    if (publicationUpdate.error) throw publicationUpdate.error;
    if (requirementUpdate.error) throw requirementUpdate.error;
    if (requestUpdate.error) throw requestUpdate.error;
    const message =
      "Reserva cancelada y sincronizada: Calendar eliminado, Drive archivado, Portal desactivado y estados operacionales actualizados.";
    for (const cancellationId of cancellationIds) {
      try {
        await deliverAssignmentCancellationBoundary(client, cancellationId);
      } catch (boundaryError) {
        console.error("[ORBIT][EVENT_CANCELLATION_BOUNDARY]", {
          stage: "staff",
          cancellationId,
          error: boundaryError instanceof Error ? boundaryError.message : String(boundaryError),
        });
      }
    }
    const boundaryTasks = [
      removeCancelledReservationCalendar({ client, projectId, actorId: auth.user.id }),
      archiveCancelledReservationDrive({ client, projectId, actorId: auth.user.id }),
      client.from("timeline_events").insert({
        customer_id: data.customer_id,
        project_id: projectId,
        orbit_event_id: data.orbit_event_id,
        event_type: "RESERVATION_CANCELLED_AND_SYNCHRONIZED",
        title: "Reserva cancelada y sincronizada",
        description: message,
        actor_id: auth.user.id,
        actor_label: "Administrador",
        source: "Administrator",
        action: "RESERVATION_CANCELLED",
        entity_type: "Project",
        entity_id: projectId,
        human_message: message,
        correlation_id: `reservation:${data.orbit_event_id}:cancelled:${crypto.randomUUID()}`,
        reason,
        created_by: auth.user.id,
      }).then(({ error: timelineError }) => {
        if (timelineError) throw timelineError;
      }),
    ];
    const boundaryResults = await Promise.allSettled(boundaryTasks);
    boundaryResults.forEach((result, index) => {
      if (result.status === "rejected")
        console.error("[ORBIT][EVENT_CANCELLATION_BOUNDARY]", {
          stage: ["calendar", "drive", "timeline"][index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
    });
    // El evento puede terminar, pero la relación CRM del cliente permanece.
    [
      "/projects",
      "/operations",
      "/finance",
      "/finance/receivables",
      "/reports",
      "/notifications",
    ].forEach((path) => revalidatePath(path));
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible eliminar el cliente.",
    };
  }
}
