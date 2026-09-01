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

export interface AutomaticBookingSubmission {
  customer: { name: string; rut: string; phone: string; email: string; address: string };
  event: { type: string; date: string; time: string; venue: string; address: string; municipality: string; operationalContact: string; operationalPhone: string };
  service: { code: string; hours: number; extras: string[]; brandingQuantity: number };
  payment: { method: "TRANSFER" | "MERCADO_PAGO"; receiptName: string; receiptType: string; receiptBase64: string };
  signatureDataUrl: string;
}

export class AutomaticBookingConfirmationError extends Error {
  constructor(public readonly module: string, public readonly reservationId: string, cause: unknown) {
    super(friendlyConfirmationMessage(module), { cause });
    this.name = "AutomaticBookingConfirmationError";
  }
}

function friendlyConfirmationMessage(module: string) {
  const messages: Record<string, string> = {
    SIGNATURE: "No fue posible guardar tu firma. Revisa el trazo e inténtalo nuevamente.",
    PAYMENT_RECEIPT: "No fue posible guardar el comprobante de pago. Vuelve a adjuntarlo e inténtalo nuevamente.",
    GOOGLE_DRIVE: "No fue posible guardar los documentos de la reserva. Inténtalo nuevamente en unos minutos.",
    GOOGLE_CALENDAR: "No fue posible sincronizar la fecha del evento. Inténtalo nuevamente en unos minutos.",
    GMAIL_AND_PORTAL: "No fue posible preparar el acceso del cliente. Inténtalo nuevamente en unos minutos.",
    SIGNATURE_AND_DOCUMENT_DELIVERY: "No fue posible guardar la firma y completar los documentos. Revisa la firma e inténtalo nuevamente.",
  };
  return messages[module] ?? "No fue posible registrar la reserva. Tus datos continúan disponibles para volver a intentarlo.";
}

export async function completeAutomaticBooking(input: { token: string; submission: AutomaticBookingSubmission; ipAddress: string; userAgent: string }) {
  const admin = createAdminClient();
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
  const { data: invitation, error: claimError } = await admin.from("automatic_booking_invitations").update({ status: "PROCESSING", processing_at: now }).eq("token_hash", automaticBookingTokenHash(input.token)).eq("customer_email", submittedEmail.trim().toLowerCase()).gt("expires_at", now).is("consumed_at", null).in("status", ["SENT", "OPENED"]).select("id,created_by,customer_email").maybeSingle();
  if (claimError) throw claimError;
  if (!invitation) throw new Error("La invitación ya no está disponible.");

  let currentModule = "VALIDATION";
  let reservationId = invitation.id;
  try {
    validate(input.submission);
    const actorId = invitation.created_by;
    const normalizedRut = input.submission.customer.rut.replace(/[^0-9K]/gi, "").toUpperCase();
    const [{ data: customerCandidates, error: customerLookupError }, pricing] = await measured("validation_and_pricing", () => Promise.all([
      admin.from("customers").select("id,rut").is("deleted_at", null),
      calculatePricing(admin, input.submission),
    ]));
    if (customerLookupError) throw customerLookupError;
    const existingCustomer = (customerCandidates ?? []).find((customer) => String(customer.rut ?? "").replace(/[^0-9K]/gi, "").toUpperCase() === normalizedRut);
    const customerId = existingCustomer?.id ?? randomUUID();
    const projectId = randomUUID();
    reservationId = projectId;
    const orbitEventId = generateOrbitEventId(input.submission.event.date, (Number.parseInt(projectId.replaceAll("-", "").slice(-8), 16) % 999999) + 1);
    currentModule = "FINANCE";
    const receiptBytes = Uint8Array.from(Buffer.from(input.submission.payment.receiptBase64, "base64"));
    if (receiptBytes.length < 20 || receiptBytes.length > 10_000_000) throw new Error("El comprobante no tiene un tamaño válido.");

    const customerValues = { full_name: input.submission.customer.name.trim(), email: invitation.customer_email, phone: input.submission.customer.phone, rut: input.submission.customer.rut, city: input.submission.event.municipality, metadata: { address: input.submission.customer.address }, updated_by: actorId };
    currentModule = "CUSTOMER";
    const { error: customerError } = await measured("customer", async () => existingCustomer
      ? await admin.from("customers").update(customerValues).eq("id", customerId)
      : await admin.from("customers").insert({ id: customerId, ...customerValues, created_by: actorId }));
    if (customerError) throw customerError;
    const notes = [`Dirección evento: ${input.submission.event.address}`, `Contacto operacional: ${input.submission.event.operationalContact} · ${input.submission.event.operationalPhone}`, "Reserva automática completada por el cliente.", "Términos BOOMBOX aceptados."].join("\n");
    const persistedExtras=input.submission.service.extras.map(extra=>extra==="Branding"?`Branding · ${Math.max(1,input.submission.service.brandingQuantity)} caras`:extra);
    const finance = { total: pricing.total, reservationAmount: Math.round(pricing.total / 2), remainingBalance: pricing.total - Math.round(pricing.total / 2), paymentMethod: input.submission.payment.method, paymentStatus: "RESERVATION_RECEIVED" };
    currentModule = "PROJECT_AND_EVENT360";
    const { error: projectError } = await measured("project_and_event360", async () => await admin.from("projects").insert({ id: projectId, customer_id: customerId, orbit_event_id: orbitEventId, name: input.submission.customer.name.trim(), project_type: input.submission.event.type, status: "Upcoming", health: "Healthy", event_date: input.submission.event.date, event_time: input.submission.event.time, location: input.submission.event.venue, city: input.submission.event.municipality, operations: { stage: "Reserva confirmada", commercialStage: "Confirmed", reservationMethod: "AUTOMATIC", notes, durationHours: input.submission.service.hours, extras: persistedExtras, brandingFaces:input.submission.service.extras.includes("Branding")?Math.max(1,input.submission.service.brandingQuantity):0 }, finance, created_by: actorId, updated_by: actorId }));
    if (projectError) throw projectError;
    currentModule = "RESERVATION_AND_CONTRACT";
    const quotationId = randomUUID();
    const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const { data: quotationNumber, error: quotationNumberError } = await admin.rpc("allocate_quotation_number", {
      p_quotation_id: quotationId,
      p_issue_date: issueDate,
    });
    if (quotationNumberError || !quotationNumber) throw quotationNumberError ?? new Error("No fue posible asignar el número de cotización.");
    const agreementId = randomUUID();
    const memory = { customer_id: customerId, context: { customerName: input.submission.customer.name, eventType: input.submission.event.type, eventDate: input.submission.event.date, currentTimelineStage: "Reserva confirmada", nextRecommendedAction: "Preparar operación" }, created_by: actorId, updated_by: actorId };
    currentModule = "TIMELINE";
    const [serviceWrite, quotationWrite, agreementWrite, memoryWrite, timelineWrite] = await measured("reservation_records", () => Promise.all([
      admin.from("project_services").insert({ project_id: projectId, service_code: input.submission.service.code, duration_hours: input.submission.service.hours, extras: persistedExtras }),
      admin.from("quotations").insert({ id: quotationId, quotation_number: quotationNumber, customer_id: customerId, project_id: projectId, orbit_event_id: orbitEventId, status: "ACCEPTED", customer_type: input.submission.event.type === "Corporate" ? "COMPANY" : "PRIVATE", event_type: input.submission.event.type, issue_date: issueDate, expiration_date: input.submission.event.date, subtotal: pricing.subtotal, transport_total: pricing.transport, discount_total: 0, tax_total: 0, grand_total: pricing.total, official_price: pricing.total, final_customer_price: pricing.total, price_difference: 0, pricing_snapshot: pricing, blockers: [], created_by: actorId, updated_by: actorId }),
      admin.from("agreements").insert({ id: agreementId, project_id: projectId, status: "SENT", template_version: "1.0", rendered_contract: { quotationNumber, termsAccepted: true, commercialSummary: pricing }, created_by: actorId, updated_by: actorId }),
      admin.from("customer_memory").upsert(memory, { onConflict: "customer_id" }),
      admin.from("timeline_events").insert({ customer_id: customerId, project_id: projectId, event_type: "AUTOMATIC_RESERVATION_CREATED", title: "Reserva automática creada.", description: "El cliente completó la reserva desde la invitación segura.", orbit_event_id: orbitEventId, actor_label: "Cliente", source: "Customer", action: "AUTOMATIC_RESERVATION_CREATED", entity_type: "Project", entity_id: projectId, human_message: "Reserva automática creada y confirmada por el cliente.", correlation_id: `automatic-booking:${invitation.id}`, created_by: actorId }),
    ]));
    for (const result of [serviceWrite, quotationWrite, agreementWrite, memoryWrite, timelineWrite]) if (result.error) throw result.error;

    currentModule = "PAYMENT_RECEIPT";
    const receiptPath = `${projectId}/${randomUUID()}-${input.submission.payment.receiptName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const [uploadedReceipt, receiptStorage] = await measured("payment_receipt", () => Promise.all([
      uploadReservationDocumentToDrive({ client: admin, projectId, customerName: input.submission.customer.name, eventDate: input.submission.event.date, kind: "PAYMENT_PROOF", name: input.submission.payment.receiptName, mimeType: input.submission.payment.receiptType, bytes: receiptBytes }),
      admin.storage.from("orbit-documents").upload(receiptPath, receiptBytes, { contentType: input.submission.payment.receiptType }),
    ]));
    const receiptUploadError = receiptStorage.error;
    if (receiptUploadError) throw receiptUploadError;
    const { error: receiptDocumentError } = await admin.from("documents").insert({ project_id: projectId, customer_id: customerId, document_type: "PAYMENT_RECEIPT", storage_bucket: "orbit-documents", storage_path: receiptPath, checksum: automaticBookingTokenHash(input.submission.payment.receiptBase64), drive_file_id: uploadedReceipt.id, created_by: actorId });
    if (receiptDocumentError) throw receiptDocumentError;

    currentModule = "SIGNATURE";
    const signingToken = randomBytes(32).toString("base64url");
    const { error: signingTokenError } = await admin.from("agreement_signing_tokens").insert({ agreement_id: agreementId, token_hash: automaticBookingTokenHash(signingToken), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), created_by: actorId });
    if (signingTokenError) throw signingTokenError;
    currentModule = "SIGNATURE_AND_DOCUMENT_DELIVERY";
    const signatureResult = await measured("contract_and_signature", () => confirmDigitalSignature({ token: signingToken, signatureDataUrl: input.submission.signatureDataUrl, ipAddress: input.ipAddress, userAgent: input.userAgent, suppressCustomerDelivery: true }));
    const portalToken = signatureResult.portalUrl.split("/p/")[1];
    if (!portalToken) throw new Error("El enlace del Portal no tiene un token válido.");
    currentModule = "UNIFIED_CONFIRMATION_PIPELINE";
    await measured("unified_confirmation_pipeline", () =>
      confirmPersistedReservation({
        client: admin,
        projectId,
        actorId,
        sendCustomerCommunication:true,
        portal: { url: signatureResult.portalUrl, expiresAt: "" },
      }),
    );
    currentModule = "RESERVATION";
    const { error: completionError } = await admin.from("automatic_booking_invitations").update({ status: "COMPLETED", consumed_at: new Date().toISOString(), processing_at: null, project_id: projectId, payload: { service: input.submission.service.code, eventDate: input.submission.event.date, total: pricing.total } }).eq("id", invitation.id);
    if (completionError) throw completionError;
    console.info(JSON.stringify({ level: "info", event: "automatic_booking.confirmation_timing", projectId, durationMs: Math.round(performance.now() - confirmationStartedAt), stages: timings }));
    return { projectId, portalUrl: signatureResult.portalUrl, contractUrl: `/api/portal/${encodeURIComponent(portalToken)}/contract?download=1`, reservationNumber: quotationNumber, eventDate: input.submission.event.date, service: input.submission.service.code, reservation: finance.reservationAmount, balance: finance.remainingBalance, total: pricing.total };
  } catch (error) {
    await admin.from("automatic_booking_invitations").update({ status: "OPENED", processing_at: null }).eq("id", invitation.id).is("consumed_at", null);
    console.error(JSON.stringify({ level: "error", event: "automatic_booking.transaction_failed", module: currentModule, reservationId, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - confirmationStartedAt), stages: timings, exception: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }));
    throw new AutomaticBookingConfirmationError(currentModule, reservationId, error);
  }
}

function validate(input: AutomaticBookingSubmission) {
  if (!input.customer.name.trim() || !isValidChileanRut(input.customer.rut) || !/^\+569\d{8}$/.test(input.customer.phone)) throw new Error("Revisa tus datos personales.");
  if (!input.event.type || !input.event.date || !input.event.time || !input.event.venue || !input.event.municipality) throw new Error("Revisa la información del evento.");
  if (!input.service.code || input.service.hours < 1 || !input.signatureDataUrl.startsWith("data:image/png;base64,")) throw new Error("Revisa el servicio y la firma.");
  if (!input.payment.receiptBase64 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(input.payment.receiptType)) throw new Error("Adjunta un comprobante válido.");
}

async function calculatePricing(admin: ReturnType<typeof createAdminClient>, input: AutomaticBookingSubmission) {
  const [pricesResult, serviceResult, venuesResult, municipalities] = await Promise.all([
    admin.from("commercial_prices").select("category,code,duration_hours,destination,unit_price,rules").eq("enabled", true).is("deleted_at", null),
    admin.from("master_data_entries").select("code,configuration").eq("domain", "SERVICES").eq("code", input.service.code).eq("enabled", true).maybeSingle(),
    admin.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
    loadActiveMunicipalities(admin),
  ]);
  if (pricesResult.error || serviceResult.error || venuesResult.error) throw pricesResult.error ?? serviceResult.error ?? venuesResult.error;
  if (!serviceResult.data) throw new Error("El servicio seleccionado ya no se encuentra disponible.");
  const prices = pricesResult.data ?? [];
  const serviceRows = prices.filter((price) => price.category === "SERVICE" && price.code === input.service.code);
  const serviceConfiguration = (serviceResult.data.configuration ?? {}) as Record<string, unknown>;
  const fixedHours = Number(serviceConfiguration.minimumHours ?? serviceConfiguration.defaultDuration ?? 0);
  const exact = serviceRows.find((price) => Number(price.duration_hours) === input.service.hours) ?? (input.service.hours === fixedHours ? serviceRows.find((price) => price.duration_hours === null) : undefined);
  if (!exact?.unit_price) throw new Error("El servicio seleccionado no tiene precio aprobado.");
  const extraCodes: Record<string, string> = { QR: "QR", Branding: "BRANDING", Imanes: "UNLIMITED_MAGNETS", Scrapbook: "SCRAPBOOK" };
  const extras = input.service.extras.reduce((sum, extra) => { const row = prices.find((price) => price.category === "EXTRA" && price.code === extraCodes[extra]); return sum + Number(row?.unit_price ?? 0) * (extra === "Branding" ? Math.max(2, input.service.brandingQuantity) : 1); }, 0);
  const municipality = municipalities.find((item) => item.name.localeCompare(input.event.municipality.trim(), "es", { sensitivity: "base" }) === 0);
  if (!municipality) throw new Error("La comuna seleccionada no tiene una configuración de transporte vigente.");
  const transport = municipality.transport;
  const venues = ((venuesResult.data?.configuration as { venues?: Array<Record<string, unknown>> } | null)?.venues ?? []);
  const venue = venues.find((item) => String(item.name ?? "").localeCompare(input.event.venue.trim(), "es", { sensitivity: "base" }) === 0);
  const venueSurcharge = Number(venue?.surcharge ?? 0);
  const subtotal = Number(exact.unit_price) + extras + transport + venueSurcharge;
  const total = Math.round(subtotal * (input.payment.method === "MERCADO_PAGO" ? 1.05 : 1));
  return { service: Number(exact.unit_price), extras, transport, venueSurcharge, subtotal, paymentCommission: total - subtotal, total };
}
