import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { generateOrbitEventId } from "@/features/connectors/google-calendar";
import { synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { confirmDigitalSignature } from "@/features/projects/signing/digital-signature.service";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "./automatic-booking.service";

export interface AutomaticBookingSubmission {
  customer: { name: string; rut: string; phone: string; email: string; address: string };
  event: { type: string; date: string; time: string; venue: string; address: string; municipality: string; operationalContact: string; operationalPhone: string };
  service: { code: string; hours: number; extras: string[]; brandingQuantity: number };
  payment: { method: "TRANSFER" | "MERCADO_PAGO"; receiptName: string; receiptType: string; receiptBase64: string };
  signatureDataUrl: string;
}

export async function completeAutomaticBooking(input: { token: string; submission: AutomaticBookingSubmission; ipAddress: string; userAgent: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const submittedEmail = input.submission?.customer?.email;
  if (typeof submittedEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) throw new Error("La información enviada no es válida.");
  const { data: invitation, error: claimError } = await admin.from("automatic_booking_invitations").update({ status: "PROCESSING", processing_at: now }).eq("token_hash", automaticBookingTokenHash(input.token)).eq("customer_email", submittedEmail.trim().toLowerCase()).gt("expires_at", now).is("consumed_at", null).in("status", ["SENT", "OPENED"]).select("id,created_by,customer_email").maybeSingle();
  if (claimError) throw claimError;
  if (!invitation) throw new Error("La invitación ya no está disponible.");

  try {
    validate(input.submission);
    const actorId = invitation.created_by;
    const customerId = randomUUID();
    const projectId = randomUUID();
    const orbitEventId = generateOrbitEventId(input.submission.event.date, (Number.parseInt(projectId.replaceAll("-", "").slice(-8), 16) % 999999) + 1);
    const pricing = await calculatePricing(admin, input.submission);
    const receiptBytes = Uint8Array.from(Buffer.from(input.submission.payment.receiptBase64, "base64"));
    if (receiptBytes.length < 20 || receiptBytes.length > 10_000_000) throw new Error("El comprobante no tiene un tamaño válido.");

    const { error: customerError } = await admin.from("customers").insert({ id: customerId, full_name: input.submission.customer.name.trim(), email: invitation.customer_email, phone: input.submission.customer.phone, rut: input.submission.customer.rut, city: input.submission.event.municipality, metadata: { address: input.submission.customer.address }, created_by: actorId, updated_by: actorId });
    if (customerError) throw customerError;
    const notes = [`Dirección evento: ${input.submission.event.address}`, `Contacto operacional: ${input.submission.event.operationalContact} · ${input.submission.event.operationalPhone}`, "Reserva automática completada por el cliente.", "Términos BOOMBOX aceptados."].join("\n");
    const finance = { total: pricing.total, reservationAmount: Math.round(pricing.total / 2), remainingBalance: pricing.total - Math.round(pricing.total / 2), paymentMethod: input.submission.payment.method, paymentStatus: "RESERVATION_RECEIVED" };
    const { error: projectError } = await admin.from("projects").insert({ id: projectId, customer_id: customerId, orbit_event_id: orbitEventId, name: input.submission.customer.name.trim(), project_type: input.submission.event.type, status: "Upcoming", health: "Healthy", event_date: input.submission.event.date, event_time: input.submission.event.time, location: input.submission.event.venue, city: input.submission.event.municipality, operations: { stage: "Reserva confirmada", commercialStage: "Confirmed", reservationMethod: "AUTOMATIC", notes, durationHours: input.submission.service.hours, extras: input.submission.service.extras }, finance, created_by: actorId, updated_by: actorId });
    if (projectError) throw projectError;
    const { error: serviceError } = await admin.from("project_services").insert({ project_id: projectId, service_code: input.submission.service.code, duration_hours: input.submission.service.hours, extras: input.submission.service.extras });
    if (serviceError) throw serviceError;

    const quotationId = randomUUID();
    const quotationNumber = `COT-AUTO-${input.submission.event.date.replaceAll("-", "")}-${projectId.slice(0, 6).toUpperCase()}`;
    const { error: quotationError } = await admin.from("quotations").insert({ id: quotationId, quotation_number: quotationNumber, customer_id: customerId, project_id: projectId, orbit_event_id: orbitEventId, status: "ACCEPTED", customer_type: input.submission.event.type === "Corporate" ? "COMPANY" : "PRIVATE", event_type: input.submission.event.type, issue_date: now.slice(0, 10), expiration_date: input.submission.event.date, subtotal: pricing.subtotal, transport_total: pricing.transport, discount_total: 0, tax_total: 0, grand_total: pricing.total, official_price: pricing.total, final_customer_price: pricing.total, price_difference: 0, pricing_snapshot: pricing, blockers: [], created_by: actorId, updated_by: actorId });
    if (quotationError) throw quotationError;
    const agreementId = randomUUID();
    const { error: agreementError } = await admin.from("agreements").insert({ id: agreementId, project_id: projectId, status: "SENT", template_version: "1.0", rendered_contract: { quotationNumber, termsAccepted: true, commercialSummary: pricing }, created_by: actorId, updated_by: actorId });
    if (agreementError) throw agreementError;
    await admin.from("customer_memory").insert({ customer_id: customerId, context: { customerName: input.submission.customer.name, eventType: input.submission.event.type, eventDate: input.submission.event.date, currentTimelineStage: "Reserva confirmada", nextRecommendedAction: "Preparar operación" }, created_by: actorId, updated_by: actorId });
    await admin.from("timeline_events").insert({ customer_id: customerId, project_id: projectId, event_type: "AUTOMATIC_RESERVATION_CREATED", title: "Reserva automática creada.", description: "El cliente completó la reserva desde la invitación segura.", orbit_event_id: orbitEventId, actor_label: "Cliente", source: "Customer", action: "AUTOMATIC_RESERVATION_CREATED", entity_type: "Project", entity_id: projectId, human_message: "Reserva automática creada y confirmada por el cliente.", correlation_id: `automatic-booking:${invitation.id}`, created_by: actorId });

    await synchronizeConfirmedReservationDrive({ client: admin, projectId, actorId });
    const uploadedReceipt = await uploadReservationDocumentToDrive({ client: admin, projectId, customerName: input.submission.customer.name, eventDate: input.submission.event.date, kind: "PAYMENT_PROOF", name: input.submission.payment.receiptName, mimeType: input.submission.payment.receiptType, bytes: receiptBytes });
    const receiptPath = `${projectId}/${randomUUID()}-${input.submission.payment.receiptName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    await admin.storage.from("orbit-documents").upload(receiptPath, receiptBytes, { contentType: input.submission.payment.receiptType });
    await admin.from("documents").insert({ project_id: projectId, customer_id: customerId, document_type: "PAYMENT_RECEIPT", storage_bucket: "orbit-documents", storage_path: receiptPath, checksum: automaticBookingTokenHash(input.submission.payment.receiptBase64), drive_file_id: uploadedReceipt.id, created_by: actorId });

    const signingToken = randomBytes(32).toString("base64url");
    await admin.from("agreement_signing_tokens").insert({ agreement_id: agreementId, token_hash: automaticBookingTokenHash(signingToken), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), created_by: actorId });
    await confirmDigitalSignature({ token: signingToken, signatureDataUrl: input.submission.signatureDataUrl, ipAddress: input.ipAddress, userAgent: input.userAgent });
    await synchronizeConfirmedReservationCalendar({ client: admin, projectId, actorId, requireCommercialReadiness: true });
    const portal = await createCustomerPortalAccess(projectId, actorId);
    await admin.from("internal_notifications").insert({ project_id: projectId, customer_id: customerId, notification_type: "AUTOMATIC_RESERVATION_CONFIRMED", title: "🎉 Nueva Reserva Confirmada", message: `${input.submission.customer.name} · ${input.submission.service.code} · ${input.submission.event.date} · ${pricing.total}`, status: "UNREAD", correlation_id: `automatic-booking-confirmed:${invitation.id}`, category: "COMMERCIAL", priority: "HIGH", action_required: false, entity_type: "Project", entity_id: projectId, related_href: `/projects/${projectId}` });
    await admin.from("automatic_booking_invitations").update({ status: "COMPLETED", consumed_at: new Date().toISOString(), processing_at: null, project_id: projectId, payload: { service: input.submission.service.code, eventDate: input.submission.event.date, total: pricing.total } }).eq("id", invitation.id);
    return { projectId, portalUrl: portal.url, total: pricing.total };
  } catch (error) {
    await admin.from("automatic_booking_invitations").update({ status: "OPENED", processing_at: null }).eq("id", invitation.id).is("consumed_at", null);
    throw error;
  }
}

function validate(input: AutomaticBookingSubmission) {
  if (!input.customer.name.trim() || !/^[0-9]{7,8}-[0-9K]$/i.test(input.customer.rut) || !/^\+569\d{8}$/.test(input.customer.phone)) throw new Error("Revisa tus datos personales.");
  if (!input.event.type || !input.event.date || !input.event.time || !input.event.venue || !input.event.municipality) throw new Error("Revisa la información del evento.");
  if (!input.service.code || input.service.hours < 1 || !input.signatureDataUrl.startsWith("data:image/png;base64,")) throw new Error("Revisa el servicio y la firma.");
  if (!input.payment.receiptBase64 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(input.payment.receiptType)) throw new Error("Adjunta un comprobante válido.");
}

async function calculatePricing(admin: ReturnType<typeof createAdminClient>, input: AutomaticBookingSubmission) {
  const { data: prices, error } = await admin.from("commercial_prices").select("category,code,duration_hours,destination,unit_price,rules").eq("enabled", true).is("deleted_at", null);
  if (error) throw error;
  const serviceRows = (prices ?? []).filter((price) => price.category === "SERVICE" && price.code === input.service.code);
  const exact = serviceRows.find((price) => Number(price.duration_hours) === input.service.hours) ?? serviceRows[0];
  if (!exact?.unit_price) throw new Error("El servicio seleccionado no tiene precio aprobado.");
  const extraCodes: Record<string, string> = { QR: "QR", Branding: "BRANDING", Imanes: "UNLIMITED_MAGNETS", Scrapbook: "SCRAPBOOK" };
  const extras = input.service.extras.reduce((sum, extra) => { const row = (prices ?? []).find((price) => price.category === "EXTRA" && price.code === extraCodes[extra]); return sum + Number(row?.unit_price ?? (extra === "Scrapbook" ? 50_000 : 0)) * (extra === "Branding" ? Math.max(2, input.service.brandingQuantity) : 1); }, 0);
  const transportRow = (prices ?? []).find((price) => price.category === "TRANSPORT" && Array.isArray((price.rules as { municipalities?: unknown })?.municipalities) && ((price.rules as { municipalities: string[] }).municipalities).includes(input.event.municipality));
  const transport = Number(transportRow?.unit_price ?? 0);
  const subtotal = Number(exact.unit_price) + extras + transport;
  const total = Math.round(subtotal * (input.payment.method === "MERCADO_PAGO" ? 1.05 : 1));
  return { service: Number(exact.unit_price), extras, transport, subtotal, paymentCommission: total - subtotal, total };
}
