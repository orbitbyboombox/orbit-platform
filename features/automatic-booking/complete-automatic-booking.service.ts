import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { generateOrbitEventId } from "@/features/connectors/google-calendar";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { confirmDigitalSignature } from "@/features/projects/signing/digital-signature.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";
import { automaticBookingTokenHash } from "./automatic-booking.service";
import { confirmPersistedReservation } from "@/features/projects/operations/confirmed-reservation-orchestrator.service";
import { isValidChileanRut } from "@/lib/chile/rut";
import { serializeWhatsAppError } from "@/features/connectors/whatsapp-cloud/whatsapp-observability";
import { isAutomaticBookingSmokeMode, smokeSinkId } from "./automatic-booking-smoke";
import { BookingTimeInvalidError, normalizeEventWindow } from "@/features/time-intelligence/event-window";
import { resolveCanonicalVenue, type CanonicalVenue } from "@/features/settings/master-data/venue-resolution";
import { resolveServicePrice, ServicePriceUnavailableError } from "./service-pricing";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";

export interface AutomaticBookingSubmission {
  customer: { name: string; rut: string; phone: string; email: string; address: string };
  event: { type: string; date: string; time: string; venue: string; address: string; municipality: string; specialVenue?: string; operationalContact: string; operationalPhone: string; shell?: "WHITE" | "BLACK" };
  service: { code: string; hours: number; extras: string[]; brandingQuantity: number; additionalCodes?: string[] };
  payment: { method: "TRANSFER" | "MERCADO_PAGO"; receiptName: string; receiptType: string; receiptBase64: string };
  signatureDataUrl: string;
}

export class AutomaticBookingConfirmationError extends Error {
  constructor(public readonly module: string, public readonly reservationId: string, cause: unknown, public readonly code = "INTERNAL_BOOKING_ERROR", public readonly requestId = randomUUID()) {
    super(friendlyConfirmationMessage(module, code), { cause });
    this.name = "AutomaticBookingConfirmationError";
  }
}

type BookingInvitationRow = {
  id: string;
  status: string | null;
  state: string | null;
  project_id: string | null;
  processing_at: string | null;
  consumed_at: string | null;
  payload: Record<string, unknown> | null;
  expires_at: string | null;
  created_by: string;
  customer_email: string;
};

function requestedServiceCodes(submission: AutomaticBookingSubmission) {
  return [...new Set([submission.service.code, ...(submission.service.additionalCodes ?? [])].map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

async function replayConfirmedBooking(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const { data: existingProject, error } = await admin.from("projects").select("id,event_date,created_by,finance,project_services(service_code),quotations(quotation_number,grand_total,final_customer_price)").eq("id", projectId).is("deleted_at", null).single();
  if (error) throw error;
  const portal = await createCustomerPortalAccess(projectId, existingProject.created_by ?? "automatic-booking-replay", { preserveExisting: false });
  const quotation = Array.isArray(existingProject.quotations) ? existingProject.quotations[0] : existingProject.quotations;
  const finance = existingProject.finance && typeof existingProject.finance === "object" ? existingProject.finance as Record<string, unknown> : {};
  const services = Array.isArray(existingProject.project_services) ? existingProject.project_services : [];
  return { alreadyConfirmed: true as const, projectId: existingProject.id, portalUrl: portal.url, contractUrl: `/projects/${existingProject.id}/documents`, reservationNumber: quotation?.quotation_number ?? null, eventDate: existingProject.event_date, service: services.map((item) => item.service_code).join(" + ") || null, reservation: Number(finance.reservationAmount ?? 0), balance: Number(finance.remainingBalance ?? 0), total: Number(quotation?.final_customer_price ?? quotation?.grand_total ?? finance.total ?? 0) };
}

// Polling is bounded by the real confirmation pipeline latency. Each read
// observes persisted invitation state; no artificial success delay is added.
const PROCESSING_POLL_DELAYS_MS = [100, 200, 400, 800, 1200, 1500, 2000, 2500, 3000, 3000] as const;

async function waitForInvitationResolution(admin: ReturnType<typeof createAdminClient>, invitationId: string) {
  for (const delay of PROCESSING_POLL_DELAYS_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const { data } = await admin.from("automatic_booking_invitations").select("status,state,project_id,processing_at,consumed_at").eq("id", invitationId).maybeSingle();
    if (!data) return null;
    if ((data.status === "COMPLETED" || data.state === "CONFIRMED") && data.project_id) return { kind: "confirmed" as const, projectId: data.project_id };
    if (data.status === "OPENED" || data.state === "FAILED_RETRYABLE") return { kind: "retryable" as const };
  }
  return { kind: "processing" as const };
}

function structuredError(error: unknown, fallbackCode: string) {
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof value?.code === "string" && value.code.trim() ? value.code : fallbackCode;
  return { code, message: serializeWhatsAppError(error) };
}

function friendlyConfirmationMessage(module: string, code?: string) {
  if (code === "CAPACITY_UNAVAILABLE") return "La fecha ya no está disponible para este horario. Tus datos siguen guardados y puedes elegir otra alternativa.";
  if (code === "BOOKING_IN_PROGRESS") return "Tu reserva ya se está procesando. Espera unos segundos antes de volver a intentarlo.";
  if (code === "PAYMENT_VALIDATION_FAILED") return "No pudimos validar el comprobante o el abono. Tus datos siguen guardados para reintentar.";
  if (code === "RESERVATION_CONFLICT") return "La reserva ya está siendo confirmada. Tus datos siguen guardados para reintentar de forma segura.";
  const messages: Record<string, string> = {
    SIGNATURE: "No fue posible guardar tu firma. Revisa el trazo e inténtalo nuevamente.",
    PAYMENT_RECEIPT: "No fue posible guardar el comprobante de pago. Vuelve a adjuntarlo e inténtalo nuevamente.",
    GOOGLE_DRIVE: "No fue posible guardar los documentos de la reserva. Inténtalo nuevamente en unos minutos.",
    GOOGLE_CALENDAR: "No fue posible sincronizar la fecha del evento. Inténtalo nuevamente en unos minutos.",
    CAPACITY_GATE: "Estamos confirmando la disponibilidad de tu fecha antes de registrar el abono. Nuestro equipo revisará tu solicitud y te contactará a la brevedad.",
    GMAIL_AND_PORTAL: "No fue posible preparar el acceso del cliente. Inténtalo nuevamente en unos minutos.",
    SIGNATURE_AND_DOCUMENT_DELIVERY: "No fue posible guardar la firma y completar los documentos. Revisa la firma e inténtalo nuevamente.",
    SERVICE_PRICE_UNAVAILABLE: "No pudimos validar el precio de uno de los servicios seleccionados.",
  };
  return messages[module] ?? "No fue posible registrar la reserva. Tus datos continúan disponibles para volver a intentarlo.";
}

export async function completeAutomaticBooking(input: { token: string; submission: AutomaticBookingSubmission; ipAddress: string; userAgent: string }) {
  const admin = createAdminClient();
  const requestId = randomUUID();
  const confirmationStartedAt = performance.now();
  const timings: Record<string, number> = {};
  const measured = async <T>(stage: string, operation: () => Promise<T>) => {
    const startedAt = performance.now();
    try { return await operation(); }
    finally { timings[stage] = Math.round(performance.now() - startedAt); }
  };
  const now = new Date().toISOString();
  const submittedEmail = input.submission?.customer?.email;
  if (typeof submittedEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) throw new Error("La información enviada no es válida.");
  const tokenHash = automaticBookingTokenHash(input.token);
  const { data: currentInvitation } = await admin.from("automatic_booking_invitations").select("id,status,state,project_id,processing_at,consumed_at,payload,expires_at,created_by,customer_email").eq("token_hash", tokenHash).eq("customer_email", submittedEmail.trim().toLowerCase()).maybeSingle() as { data: BookingInvitationRow | null };
  if (currentInvitation?.status === "COMPLETED" && currentInvitation.state === "CONFIRMED" && currentInvitation.project_id) {
    return replayConfirmedBooking(admin, currentInvitation.project_id);
  }
  if (currentInvitation?.status === "PROCESSING" && currentInvitation.processing_at && Date.now() - new Date(currentInvitation.processing_at).getTime() < 10 * 60_000) {
    const resolution = await waitForInvitationResolution(admin, currentInvitation.id);
    if (resolution?.kind === "confirmed") return replayConfirmedBooking(admin, resolution.projectId);
    if (resolution?.kind === "processing") throw new Error("BOOKING_IN_PROGRESS");
  }
  if (currentInvitation?.status === "PROCESSING") await admin.from("automatic_booking_invitations").update({ status: "OPENED", processing_at: null }).eq("id", currentInvitation.id).eq("status", "PROCESSING");
  const { data: invitation, error: claimError } = await admin.from("automatic_booking_invitations").update({ status: "PROCESSING", processing_at: now }).eq("token_hash", tokenHash).eq("customer_email", submittedEmail.trim().toLowerCase()).gt("expires_at", now).is("consumed_at", null).in("status", ["SENT", "OPENED", "FAILED_RETRYABLE"]).select("id,created_by,customer_email,project_id,payload,status").maybeSingle();
  if (claimError) throw claimError;
  if (!invitation) {
    const raced = await admin.from("automatic_booking_invitations").select("id,status,state,project_id,processing_at,consumed_at").eq("token_hash", tokenHash).eq("customer_email", submittedEmail.trim().toLowerCase()).maybeSingle();
    if ((raced.data?.status === "COMPLETED" || raced.data?.state === "CONFIRMED") && raced.data.project_id) return replayConfirmedBooking(admin, raced.data.project_id);
    if (raced.data?.status === "PROCESSING") {
      const resolution = await waitForInvitationResolution(admin, raced.data.id);
      if (resolution?.kind === "confirmed") return replayConfirmedBooking(admin, resolution.projectId);
      throw new Error("BOOKING_IN_PROGRESS");
    }
    throw new Error("BOOKING_TOKEN_INVALID");
  }

  let currentModule = "VALIDATION";
  let reservationId = invitation.project_id ?? invitation.id;
  const smokeMode = isAutomaticBookingSmokeMode(invitation.payload);
  try {
    validate(input.submission);
    const normalizedWindow = normalizeEventWindow({ eventDate: input.submission.event.date, serviceStart: input.submission.event.time, durationHours: input.submission.service.hours });
    const actorId = invitation.created_by;
    const normalizedRut = input.submission.customer.rut.replace(/[^0-9K]/gi, "").toUpperCase();
    const [{ data: customerCandidates, error: customerLookupError }, pricing] = await measured("validation_and_pricing", () => Promise.all([
      admin.from("customers").select("id,rut").is("deleted_at", null),
      calculatePricing(admin, input.submission),
    ]));
    if (customerLookupError) throw customerLookupError;
    const existingCustomer = (customerCandidates ?? []).find((customer) => String(customer.rut ?? "").replace(/[^0-9K]/gi, "").toUpperCase() === normalizedRut);
    const existingProject = invitation.project_id
      ? (await admin.from("projects").select("id,customer_id,orbit_event_id").eq("id", invitation.project_id).is("deleted_at", null).maybeSingle()).data
      : null;
    const customerId = existingProject?.customer_id ?? existingCustomer?.id ?? randomUUID();
    const projectId = existingProject?.id ?? randomUUID();
    reservationId = projectId;
    const orbitEventId = existingProject?.orbit_event_id ?? generateOrbitEventId(input.submission.event.date, (Number.parseInt(projectId.replaceAll("-", "").slice(-8), 16) % 999999) + 1);
    currentModule = "FINANCE";
    const receiptBytes = Uint8Array.from(Buffer.from(input.submission.payment.receiptBase64, "base64"));
    if (receiptBytes.length < 20 || receiptBytes.length > 10_000_000) throw new Error("El comprobante no tiene un tamaño válido.");

    const customerValues = { full_name: input.submission.customer.name.trim(), email: invitation.customer_email, phone: input.submission.customer.phone, rut: input.submission.customer.rut, city: input.submission.event.municipality, metadata: { address: input.submission.customer.address }, updated_by: actorId };
    currentModule = "CUSTOMER";
    const { error: customerError } = await measured("customer", async () => existingProject || existingCustomer
      ? await admin.from("customers").update(customerValues).eq("id", customerId)
      : await admin.from("customers").insert({ id: customerId, ...customerValues, created_by: actorId }));
    if (customerError) throw customerError;
    const notes = [`Dirección evento: ${input.submission.event.address}`, `Contacto operacional: ${input.submission.event.operationalContact} · ${input.submission.event.operationalPhone}`, "Solicitud automática en validación de capacidad.", "Términos BOOMBOX aceptados."].join("\n");
    const selectedServiceCodes = requestedServiceCodes(input.submission);
    const persistedExtras=input.submission.service.extras.map(extra=>extra==="Branding"?`Branding · ${Math.max(1,input.submission.service.brandingQuantity)} caras`:extra);
    // Everything written before the final capacity gate is resumable draft
    // state. The commit boundary is the only place allowed to expose a
    // confirmed commercial/operational state.
    const finance = { total: pricing.total, reservationAmount: Math.round(pricing.total / 2), remainingBalance: pricing.total - Math.round(pricing.total / 2), paymentMethod: input.submission.payment.method, paymentStatus: "PENDING" };
    currentModule = "PROJECT_AND_EVENT360";
    const { error: projectError } = await measured("project_and_event360", async () => existingProject ? { error: null } : await admin.from("projects").insert({ id: projectId, customer_id: customerId, orbit_event_id: orbitEventId, name: input.submission.customer.name.trim(), project_type: input.submission.event.type, status: "Upcoming", health: "Healthy", event_date: input.submission.event.date, event_time: input.submission.event.time, location: input.submission.event.venue, city: input.submission.event.municipality, operations: { stage: "Capacidad pendiente", commercialStage: "Waiting", reservationMethod: "AUTOMATIC", automaticBookingInvitationId: invitation.id, notes, durationHours: input.submission.service.hours, serviceStartAt: normalizedWindow.startAt, serviceEndAt: normalizedWindow.endAt, shell: input.submission.event.shell ?? null, specialVenue: input.submission.event.specialVenue ?? null, services: selectedServiceCodes, extras: persistedExtras, brandingFaces:input.submission.service.extras.includes("Branding")?Math.max(1,input.submission.service.brandingQuantity):0 }, finance, created_by: actorId, updated_by: actorId }));
    if (projectError) throw projectError;
    const checkpoint = await admin.from("automatic_booking_invitations").update({ project_id: projectId, state: "VALIDATING", last_request_id: requestId, payload: { ...(invitation.payload ?? {}), projectId, state: "VALIDATING", requestId } }).eq("id", invitation.id);
    if (checkpoint.error) throw checkpoint.error;
    currentModule = "RESERVATION_AND_CONTRACT";
    const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const existingQuotation = (await admin.from("quotations").select("id,quotation_number").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    const quotationId = existingQuotation?.id ?? randomUUID();
    let quotationNumber = existingQuotation?.quotation_number ?? null;
    if (!quotationNumber) {
      const allocated = await admin.rpc("allocate_quotation_number", { p_quotation_id: quotationId, p_issue_date: issueDate });
      if (allocated.error || !allocated.data) throw allocated.error ?? new Error("No fue posible asignar el número de cotización.");
      quotationNumber = allocated.data;
    }
    const existingAgreement = (await admin.from("agreements").select("id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    const agreementId = existingAgreement?.id ?? randomUUID();
    const memory = { customer_id: customerId, context: { customerName: input.submission.customer.name, eventType: input.submission.event.type, eventDate: input.submission.event.date, currentTimelineStage: "Reserva confirmada", nextRecommendedAction: "Preparar operación" }, created_by: actorId, updated_by: actorId };
    currentModule = "TIMELINE";
    await measured("reservation_records", async () => {
      for (const serviceCode of selectedServiceCodes) {
        const line = pricing.serviceLines.find((item) => item.code === serviceCode);
        const result = await admin.from("project_services").upsert({ project_id: projectId, service_code: serviceCode, duration_hours: line?.hours ?? null, extras: serviceCode === input.submission.service.code ? persistedExtras : [] }, { onConflict: "project_id,service_code" });
        if (result.error) throw result.error;
      }
      if (!existingQuotation) { const result = await admin.from("quotations").insert({ id: quotationId, quotation_number: quotationNumber, customer_id: customerId, project_id: projectId, orbit_event_id: orbitEventId, status: "DRAFT", customer_type: input.submission.event.type === "Corporate" ? "COMPANY" : "PRIVATE", event_type: input.submission.event.type, issue_date: issueDate, expiration_date: input.submission.event.date, subtotal: pricing.subtotal, transport_total: pricing.transport, discount_total: 0, tax_total: 0, grand_total: pricing.total, official_price: pricing.total, final_customer_price: pricing.total, price_difference: 0, pricing_snapshot: pricing, blockers: [], created_by: actorId, updated_by: actorId }); if (result.error) throw result.error; }
      if (!existingAgreement) { const result = await admin.from("agreements").insert({ id: agreementId, project_id: projectId, status: "SENT", template_version: "1.0", rendered_contract: { quotationNumber, termsAccepted: true, commercialSummary: pricing }, created_by: actorId, updated_by: actorId }); if (result.error) throw result.error; }
      const memoryWrite = await admin.from("customer_memory").upsert(memory, { onConflict: "customer_id" });
      if (memoryWrite.error) throw memoryWrite.error;
      const timelineWrite = await admin.from("timeline_events").upsert({ customer_id: customerId, project_id: projectId, event_type: "AUTOMATIC_RESERVATION_CREATED", title: "Solicitud automática creada.", description: "El cliente completó la solicitud desde la invitación segura; capacidad pendiente de confirmación.", orbit_event_id: orbitEventId, actor_label: "Cliente", source: "Customer", action: "AUTOMATIC_RESERVATION_CREATED", entity_type: "Project", entity_id: projectId, human_message: "Solicitud automática creada; capacidad pendiente de confirmación.", correlation_id: `automatic-booking:${projectId}`, created_by: actorId }, { onConflict: "correlation_id", ignoreDuplicates: true });
      if (timelineWrite.error) throw timelineWrite.error;
    });

    // Capacity is revalidated immediately before any customer payment is
    // registered. The final CONFIRMED transition remains protected by the
    // database gate (including its concurrency lock).
    currentModule = "CAPACITY_GATE";
    const { data: capacity, error: capacityError } = await admin.rpc("preflight_reservation_capacity", { p_project_id: projectId });
    if (capacityError) throw capacityError;
    if (!capacity || typeof capacity !== "object" || (capacity as { status?: string }).status !== "AVAILABLE") {
      throw new Error("La disponibilidad debe confirmarse antes de registrar el abono.");
    }

    currentModule = "CONFIRMING";
    const { error: canonicalRecordError } = await admin.rpc("prepare_confirmed_reservation_records", { p_project_id: projectId, p_actor_id: actorId });
    if (canonicalRecordError) throw canonicalRecordError;
    await admin.from("automatic_booking_invitations").update({ payload: { ...(invitation.payload ?? {}), projectId, state: "CONFIRMING", requestId } }).eq("id", invitation.id);

    currentModule = "PAYMENT_RECEIPT";
    const receiptChecksum = automaticBookingTokenHash(input.submission.payment.receiptBase64);
    const existingReceipt = (await admin.from("documents").select("id,storage_path").eq("project_id", projectId).eq("document_type", "PAYMENT_RECEIPT").eq("checksum", receiptChecksum).is("deleted_at", null).maybeSingle()).data;
    let receiptDocument = existingReceipt;
    if (!receiptDocument) {
      const receiptPath = smokeMode ? smokeSinkId("receipt", `${projectId}/${receiptChecksum}`) : `${projectId}/${receiptChecksum}-${input.submission.payment.receiptName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      if (!smokeMode) {
        const receiptStorage = await measured("payment_receipt_storage", () => admin.storage.from("orbit-documents").upload(receiptPath, receiptBytes, { contentType: input.submission.payment.receiptType, upsert: true }));
        if (receiptStorage.error) throw receiptStorage.error;
      }
      const inserted = await admin.from("documents").insert({ project_id: projectId, customer_id: customerId, document_type: "PAYMENT_RECEIPT", storage_bucket: "orbit-documents", storage_path: receiptPath, checksum: receiptChecksum, original_filename: input.submission.payment.receiptName, mime_type: input.submission.payment.receiptType, file_size: receiptBytes.length, uploaded_by: actorId, drive_sync_status: smokeMode ? "SYNCED" : "PENDING", metadata: smokeMode ? { smokeMode: true, externalSink: receiptPath } : undefined, created_by: actorId }).select("id,storage_path").single();
      receiptDocument = inserted.data;
      if (inserted.error || !receiptDocument) throw inserted.error ?? new Error("No fue posible guardar el comprobante.");
    }

    currentModule = "PAYMENT_LEDGER";
    const { error: paymentError } = await admin.rpc("register_automatic_booking_deposit", {
      p_project_id: projectId,
      p_receipt_document_id: receiptDocument.id,
      p_actor_id: actorId,
      p_method: input.submission.payment.method,
    });
    if (paymentError) throw paymentError;

    currentModule = "GOOGLE_DRIVE";
    try {
      if (smokeMode) {
        console.info(JSON.stringify({ level: "info", event: "automatic_booking.smoke_sink", sink: "drive", projectId, documentId: receiptDocument.id }));
      } else {
      const uploadedReceipt = await measured("payment_receipt_drive", () => uploadReservationDocumentToDrive({ client: admin, projectId, customerName: input.submission.customer.name, eventDate: input.submission.event.date, kind: "PAYMENT_PROOF", name: input.submission.payment.receiptName, mimeType: input.submission.payment.receiptType, bytes: receiptBytes }));
      const { error: receiptDriveLinkError } = await admin.from("documents").update({ drive_file_id: uploadedReceipt.id, drive_sync_status: "SYNCED", drive_sync_error: null, drive_synced_at: new Date().toISOString() }).eq("id", receiptDocument.id);
      if (receiptDriveLinkError) throw receiptDriveLinkError;
      }
    } catch (driveError) {
      const message = serializeWhatsAppError(driveError);
      await admin.from("documents").update({ drive_sync_status: "FAILED", drive_sync_error: message }).eq("id", receiptDocument.id);
      await admin.from("internal_notifications").upsert({ project_id: projectId, customer_id: customerId, notification_type: "AUTOMATIC_BOOKING_RECEIPT_DRIVE_FAILED", title: "Comprobante pendiente de archivar en Drive", message: "El abono quedó registrado correctamente. Reintenta solamente el archivo del comprobante en Drive.", status: "UNREAD", correlation_id: `automatic-booking-receipt-drive:${projectId}`, category: "SYSTEM", priority: "HIGH", action_required: true, entity_type: "Document", entity_id: receiptDocument.id, related_href: `/projects/${projectId}`, metadata: { documentId: receiptDocument.id, error: message } }, { onConflict: "correlation_id" });
      console.error(JSON.stringify({ level: "error", event: "automatic_booking.receipt_drive_failed", projectId, documentId: receiptDocument.id, error: message, timestamp: new Date().toISOString() }));
    }

    currentModule = "SIGNATURE";
    const signingToken = randomBytes(32).toString("base64url");
    const { error: signingTokenError } = await admin.from("agreement_signing_tokens").insert({ agreement_id: agreementId, token_hash: automaticBookingTokenHash(signingToken), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), created_by: actorId });
    if (signingTokenError) throw signingTokenError;
    currentModule = "SIGNATURE_AND_DOCUMENT_DELIVERY";
    const signatureResult = await measured("contract_and_signature", () => confirmDigitalSignature({ token: signingToken, signatureDataUrl: input.submission.signatureDataUrl, ipAddress: input.ipAddress, userAgent: input.userAgent, suppressCustomerDelivery: true, smokeMode }));
    const portalToken = signatureResult.portalUrl?.split("/p/")[1] ?? null;
    currentModule = "UNIFIED_CONFIRMATION_PIPELINE";
    await measured("unified_confirmation_pipeline", () =>
      confirmPersistedReservation({
        client: admin,
        projectId,
        actorId,
        sendCustomerCommunication:true,
        smokeMode,
        portal: { url: signatureResult.portalUrl ?? "", expiresAt: "" },
      }),
    );
    currentModule = "RESERVATION";
    const { error: completionError } = await admin.from("automatic_booking_invitations").update({ status: "COMPLETED", state: "CONFIRMED", consumed_at: new Date().toISOString(), processing_at: null, project_id: projectId, last_request_id: requestId, failure_code: null, failure_stage: null, payload: { ...(invitation.payload ?? {}), projectId, state: "CONFIRMED", service: input.submission.service.code, services: selectedServiceCodes, eventDate: input.submission.event.date, total: pricing.total, requestId } }).eq("id", invitation.id);
    if (completionError) throw completionError;
    console.info(JSON.stringify({ level: "info", event: "automatic_booking.confirmation_timing", requestId, projectId, durationMs: Math.round(performance.now() - confirmationStartedAt), stages: timings }));
    return { projectId, portalUrl: signatureResult.portalUrl, contractUrl: portalToken ? `/api/portal/${encodeURIComponent(portalToken)}/contract?download=1` : null, reservationNumber: quotationNumber, eventDate: input.submission.event.date, service: selectedServiceCodes.join(" + "), reservation: finance.reservationAmount, balance: finance.remainingBalance, total: pricing.total };
  } catch (error) {
    const failure = structuredError(error, error instanceof BookingTimeInvalidError ? "BOOKING_TIME_INVALID" : currentModule === "CAPACITY_GATE" || currentModule === "CONFIRMING" ? "CAPACITY_UNAVAILABLE" : currentModule === "PAYMENT_LEDGER" ? "PAYMENT_VALIDATION_FAILED" : currentModule === "CUSTOMER" ? "CUSTOMER_CREATION_FAILED" : currentModule === "TIMELINE" ? "RESERVATION_CONFLICT" : "INTERNAL_BOOKING_ERROR");
    await admin.from("automatic_booking_invitations").update({ status: "OPENED", state: "FAILED_RETRYABLE", failure_code: failure.code, failure_stage: currentModule, last_request_id: requestId, processing_at: null, payload: { ...(invitation.payload ?? {}), projectId: invitation.project_id ?? null, state: "FAILED_RETRYABLE", failureCode: failure.code, failureStage: currentModule, requestId } }).eq("id", invitation.id).is("consumed_at", null);
    const pricingFailure = error instanceof ServicePriceUnavailableError
      ? { serviceCode: error.serviceCode, pricingMode: error.pricingMode, requestedDuration: error.requestedDuration }
      : undefined;
    console.error(JSON.stringify({ level: "error", event: "automatic_booking.transaction_failed", requestId, stage: currentModule, code: failure.code, module: currentModule, reservationId, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - confirmationStartedAt), stages: timings, exception: failure.message, pricingFailure }));
    throw new AutomaticBookingConfirmationError(currentModule, reservationId, error, failure.code, requestId);
  }
}

function validate(input: AutomaticBookingSubmission) {
  if (!input.customer.name.trim() || !isValidChileanRut(input.customer.rut) || !/^\+569\d{8}$/.test(input.customer.phone)) throw new Error("Revisa tus datos personales.");
  if (!input.event.type || !input.event.date || !input.event.time || !input.event.venue || !input.event.municipality) throw new Error("Revisa la información del evento.");
  if (!input.service.code || input.service.hours < 1 || (input.service.additionalCodes ?? []).some((code) => !code || code === input.service.code) || !input.signatureDataUrl.startsWith("data:image/png;base64,")) throw new Error("Revisa los servicios y la firma.");
  if (!input.payment.receiptBase64 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(input.payment.receiptType)) throw new Error("Adjunta un comprobante válido.");
}

async function calculatePricing(admin: ReturnType<typeof createAdminClient>, input: AutomaticBookingSubmission) {
  const serviceCodes = requestedServiceCodes(input);
  const [pricesResult, serviceResult, venuesResult, municipalities] = await Promise.all([
    admin.from("commercial_prices").select("category,code,duration_hours,destination,unit_price,rules").eq("enabled", true).is("deleted_at", null),
    admin.from("master_data_entries").select("code,configuration").eq("domain", "SERVICES").in("code", serviceCodes).eq("enabled", true),
    admin.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
    loadActiveMunicipalities(admin),
  ]);
  if (pricesResult.error || serviceResult.error || venuesResult.error) throw pricesResult.error ?? serviceResult.error ?? venuesResult.error;
  if (!serviceResult.data || serviceResult.data.length !== serviceCodes.length) throw new Error("Uno de los servicios seleccionados ya no se encuentra disponible.");
  const prices = pricesResult.data ?? [];
  const serviceLines = serviceCodes.map((code) => {
    const master = serviceResult.data.find((item) => item.code === code);
    const serviceRows = prices.filter((price) => price.category === "SERVICE" && price.code === code);
    const serviceConfiguration = (master?.configuration ?? {}) as Record<string, unknown>;
    const fixedHours = Number(serviceConfiguration.minimumHours ?? serviceConfiguration.defaultDuration ?? 0);
    const resolved = resolveServicePrice({ serviceCode: code, requestedDuration: input.service.hours, rows: serviceRows, fixedHours });
    return { code, ...resolved };
  });
  const extraCodes: Record<string, string> = { QR: "QR", Branding: "BRANDING", Imanes: "UNLIMITED_MAGNETS", Scrapbook: "SCRAPBOOK" };
  const extras = input.service.extras.reduce((sum, extra) => { const row = prices.find((price) => price.category === "EXTRA" && price.code === extraCodes[extra]); return sum + Number(row?.unit_price ?? 0) * (extra === "Branding" ? Math.max(2, input.service.brandingQuantity) : 1); }, 0);
  const municipality = municipalities.find((item) => item.name.localeCompare(input.event.municipality.trim(), "es", { sensitivity: "base" }) === 0);
  if (!municipality) throw new Error("La comuna seleccionada no tiene una configuración de transporte vigente.");
  const transport = municipality.transport;
  const venues = ((venuesResult.data?.configuration as { venues?: Array<Record<string, unknown>> } | null)?.venues ?? []) as CanonicalVenue[];
  const venue = resolveCanonicalVenue(input.event.specialVenue ?? "", input.event.municipality, venues);
  const venueSurcharge = Number(venue?.surcharge ?? 0);
  const serviceTotal = serviceLines.reduce((sum, line) => sum + line.amount, 0);
  const subtotal = serviceTotal + extras + transport + venueSurcharge;
  const total = Math.round(subtotal * (input.payment.method === "MERCADO_PAGO" ? 1.05 : 1));
  return { service: serviceTotal, serviceLines, extras, transport, venueSurcharge, subtotal, paymentCommission: total - subtotal, total };
}
