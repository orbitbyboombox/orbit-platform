import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIGITAL_PHOTO_REVIEW_URL,
  DIGITAL_PHOTO_SUBJECT,
  digitalPhotoDeliveryText,
  formatDigitalPhotoEventDate,
  renderDigitalPhotoDeliveryHtml,
  renderDigitalPhotoDeliveryPreviewHtml,
  validateDigitalPhotoDeliveryUrl,
} from "../features/connectors/google-gmail/application/digital-photo-delivery.template.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const service = read(
  "features/connectors/google-gmail/application/digital-photo-delivery.service.ts",
);
const actions = read(
  "features/projects/communications/digital-photo-delivery.actions.ts",
);
const control = read(
  "features/projects/communications/digital-photo-delivery-control.tsx",
);
const workspace = read(
  "features/projects/components/project-workspace-experience.tsx",
);
const migration = read("supabase/migrations/0196_digital_photo_delivery.sql");
const photoUrl = "https://drive.google.com/drive/folders/photo-delivery";
const eventDate = "2026-09-14";
const eventDateLabel = "14 de septiembre de 2026";

test("Founder action is visible from every canonical Event", () => {
  assert.match(workspace, /label="Enviar fotos digitales"/);
  assert.match(workspace, /DigitalPhotoDeliveryControl/);
  assert.match(control, /ENVIAR FOTOS DIGITALES/);
  assert.match(control, /REENVIAR FOTOS DIGITALES/);
});

test("server authorization accepts only existing administrative roles", () => {
  assert.match(actions, /isAdministrativeRole/);
  assert.match(actions, /Solo Founder o Administración puede enviar fotos digitales/);
  assert.match(actions, /createSupabaseServerClient/);
  assert.doesNotMatch(actions, /role === "STAFF"|role === "CUSTOMER"/);
});

test("photo delivery URL is required and must be safe HTTPS", () => {
  assert.equal(validateDigitalPhotoDeliveryUrl(photoUrl), photoUrl);
  for (const value of [
    "",
    "not a URL",
    "javascript:alert(1)",
    "data:text/html,boom",
    "http://drive.google.com/folder",
    "https://user:password@example.com/private",
  ]) {
    assert.throws(
      () => validateDigitalPhotoDeliveryUrl(value),
      /Ingresa un enlace válido para las fotos digitales/,
    );
  }
});

test("the one universal premium template is used across Event types", () => {
  const empresa = renderDigitalPhotoDeliveryHtml("Empresa BOOMBOX", eventDate, photoUrl);
  const wedding = renderDigitalPhotoDeliveryHtml("Matrimonio BOOMBOX", eventDate, photoUrl);
  const birthday = renderDigitalPhotoDeliveryHtml("Cumpleaños BOOMBOX", eventDate, photoUrl);
  for (const html of [empresa, wedding, birthday]) {
    assert.match(html, />BOOMBOX</);
    assert.match(html, />Fotos digitales</);
    assert.match(html, /max-width:620px/);
    assert.match(html, /background:#101216/);
  }
  assert.doesNotMatch(service, /photo-email-(empresa|matrimonio|cumpleanos)/i);
  assert.doesNotMatch(service, /project_type|customer_type|WEDDING|BIRTHDAY|CORPORATE/);
});

test("customer copy is warm, concise and universal", () => {
  const html = renderDigitalPhotoDeliveryHtml("Jenniffer Chavez", eventDate, photoUrl);
  assert.match(html, /Hola Jenniffer Chavez,/);
  assert.match(html, /Esperamos que te encuentres muy bien/);
  assert.match(html, /agradecerte por elegir a BOOMBOX/);
  assert.match(html, /tú y tus invitados hayan disfrutado la experiencia BOOMBOX/);
  assert.equal(DIGITAL_PHOTO_SUBJECT, "Tus fotos BOOMBOX ya están disponibles 📸");
});

test("email intentionally contains no Event or financial detail section", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.doesNotMatch(html, /DETALLE DEL EVENTO|Detalle del evento/);
  assert.doesNotMatch(html, /FECHA DEL EVENTO|LUGAR DEL EVENTO|SERVICIO|DURACIÓN/);
  assert.doesNotMatch(html, /LUGAR|UBICACIÓN|HORARIO|EVENT ID|ORB-\d+/i);
  assert.doesNotMatch(html, /SALDO|PAGO|FACTURA|ABONO|TOTAL/);
  assert.doesNotMatch(service, /location|project_services|duration|financial_event_records/);
});

test("canonical Event date appears once in the thank-you sentence in Spanish", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  const text = digitalPhotoDeliveryText("Cliente", eventDate, photoUrl);
  const sentence = `Queremos agradecerte por elegir a BOOMBOX y permitirnos ser parte de tu evento el día ${eventDateLabel}.`;
  assert.equal(formatDigitalPhotoEventDate(eventDate), eventDateLabel);
  assert.match(html, new RegExp(sentence));
  assert.match(text, new RegExp(sentence));
  assert.equal((html.match(new RegExp(eventDateLabel, "g")) ?? []).length, 1);
  assert.equal((text.match(new RegExp(eventDateLabel, "g")) ?? []).length, 1);
  assert.match(service, /event_date/);
  assert.match(service, /eventDate: project\.event_date/);
});

test("download card has the 10-day policy and exact supplied destination", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.match(html, /Tus fotos digitales ya están disponibles para descarga/);
  assert.match(html, /El enlace estará disponible durante 10 días/);
  assert.match(html, /descargar y guardar tus fotos dentro de este plazo/);
  assert.match(html, />DESCARGAR FOTOS</);
  assert.match(html, new RegExp(`href="${photoUrl}"`));
  assert.equal((html.match(new RegExp(photoUrl, "g")) ?? []).length, 1);
});

test("raw destinations are hidden from visible customer HTML", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.doesNotMatch(visible, /drive\.google\.com/);
  assert.doesNotMatch(visible, /g\.page\/r\//);
});

test("Google review section uses the exact secondary CTA", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.equal(DIGITAL_PHOTO_REVIEW_URL, "https://g.page/r/CZpNpQkYOwLnEAI/review");
  assert.match(html, /Tu experiencia nos importa/);
  assert.match(html, /compartir tu opinión/);
  assert.match(html, /ayuda a otras personas a elegir su experiencia/);
  assert.match(html, />DEJAR UNA RESEÑA EN GOOGLE</);
  assert.match(html, /href="https:\/\/g\.page\/r\/CZpNpQkYOwLnEAI\/review"/);
});

test("download CTA remains visually dominant over review CTA", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  const download = html.match(/<a href="[^"]+"[^>]+>DESCARGAR FOTOS<\/a>/)?.[0] ?? "";
  const review = html.match(/<a href="[^"]+"[^>]+>DEJAR UNA RESEÑA EN GOOGLE<\/a>/)?.[0] ?? "";
  assert.match(download, /background:#ed7203/);
  assert.match(download, /color:#ffffff/);
  assert.match(review, /background:#ffffff/);
  assert.match(review, /border:1px solid #ed7203/);
});

test("closing and canonical ORBIT footer are exact", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.match(html, /Nuevamente, muchas gracias por confiar en BOOMBOX/);
  assert.match(html, /Un abrazo/);
  assert.match(html, /Equipo BOOMBOX 📸✨/);
  assert.match(html, /BOOMBOX · Comunicación emitida mediante ORBIT/);
  assert.match(html, /ORBIT · Software desarrollado por BOOMBOX/);
  assert.match(html, />www\.bbox\.cl</);
});

test("current URL persists on the Event and historical URL persists per communication", () => {
  assert.match(migration, /projects[\s\S]*digital_photo_delivery_url text/);
  assert.match(migration, /communications[\s\S]*delivery_reference text/);
  assert.match(service, /digital_photo_delivery_url: photoUrl/);
  assert.match(service, /delivery_reference: photoUrl/);
  assert.match(service, /photoUrl: item\.delivery_reference/);
  assert.doesNotMatch(service, /communications"\)\.update\([\s\S]*delivery_reference/);
});

test("composer reload reads canonical Event and Customer relationships", () => {
  assert.match(service, /projects"\)/);
  assert.match(service, /customer_id,orbit_event_id,event_date,digital_photo_delivery_url/);
  assert.match(service, /customers!inner\(full_name,email,secondary_email\)/);
  assert.match(service, /projectId/);
  assert.match(service, /customerId/);
});

test("canonical recipient resolver preserves TO CC and deduplication", () => {
  assert.match(service, /normalizeEmailRecipients/);
  assert.match(service, /to: composer\.to/);
  assert.match(service, /cc: input\.cc \?\? composer\.cc/);
  assert.match(service, /to_recipient: recipients\.to/);
  assert.match(service, /cc_recipients: recipients\.cc/);
});

test("communication history is immutable, typed and provider-backed", () => {
  assert.match(service, /communication_type: "DIGITAL_PHOTO_DELIVERY"/);
  assert.match(service, /status: "QUEUED"/);
  assert.match(service, /status: "SENT"/);
  assert.match(service, /external_message_id: delivered\.messageId/);
  assert.match(service, /sent_at: sentAt/);
  assert.match(service, /original_communication_id: firstSuccessful\?\.id/);
});

test("one deliberate request is idempotent across double click and network retry", () => {
  assert.match(migration, /communications_digital_photo_delivery_request_uidx/);
  assert.match(service, /digital-photo-delivery:\$\{projectId\}:\$\{attemptId\}/);
  assert.match(service, /idempotencyKey: key/);
  assert.match(service, /insertError\.code === "23505"/);
  assert.match(service, /deduplicated: true/);
  assert.match(control, /submissionGate\.current/);
});

test("intentional resend is explicit and linked to the first successful send", () => {
  assert.match(service, /hasSuccessfulSend && !input\.confirmResend/);
  assert.match(control, /¿Enviar nuevamente las fotos digitales a/);
  assert.match(control, /Sí, enviar nuevamente/);
  assert.match(service, /original_communication_id/);
});

test("provider acceptance is never rewritten as FAILED by a persistence error", () => {
  assert.match(service, /let providerAccepted = false/);
  assert.match(service, /providerAccepted = true/);
  assert.match(service, /if \(!providerAccepted\)/);
  assert.match(actions, /El proveedor confirmó el envío\. El historial está sincronizando/);
});

test("Event Timeline records the successful delivery without closing the Event", () => {
  assert.match(service, /DIGITAL_PHOTO_DELIVERY_SENT/);
  assert.match(service, /FOTOS DIGITALES ENVIADAS/);
  assert.match(service, /Enviado a:/);
  assert.match(service, /timeline_events/);
  assert.doesNotMatch(service, /status:\s*"(COMPLETED|CLOSED|PAID)"/);
});

test("Founder dialog is mobile-safe and requires preview before send", () => {
  assert.match(control, /MobileDialog/);
  assert.match(control, /variant="fullscreen-mobile"/);
  assert.match(control, /LINK FOTOS DIGITALES/);
  assert.match(control, /label="ASUNTO" value=\{composer\.subject\}/);
  assert.match(control, /https:\/\/drive\.google\.com\/\.\.\./);
  assert.match(control, /ACTUALIZAR VISTA PREVIA/);
  assert.match(control, /VISTA PREVIA DEL CORREO/);
  assert.match(control, /renderDigitalPhotoDeliveryPreviewHtml/);
  assert.match(control, /!photoUrl\.trim\(\)/);
  assert.match(control, /previewUrl !== photoUrl\.trim\(\)/);
  assert.match(control, /iframe/);
  assert.match(control, /sandbox=""/);
  assert.match(control, /ENVIANDO\.\.\./);
  assert.match(control, /✓ Fotos digitales enviadas correctamente|result\.message/);
  assert.doesNotMatch(actions, /detail: message\(error\)/);
});

test("Founder sees the real premium email preview before adding a photo URL", () => {
  const html = renderDigitalPhotoDeliveryPreviewHtml("Cliente", eventDate, "");
  assert.match(html, />BOOMBOX</);
  assert.match(html, />Fotos digitales</);
  assert.match(html, /El enlace estará disponible durante 10 días/);
  assert.equal((html.match(new RegExp(eventDateLabel, "g")) ?? []).length, 1);
  assert.match(html, />DEJAR UNA RESEÑA EN GOOGLE</);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Agrega el enlace de las fotos para habilitar este botón/);
  assert.doesNotMatch(html, /href="https:\/\/preview\.invalid/);
});

test("valid live preview is byte-identical to the certified customer renderer", () => {
  const preview = renderDigitalPhotoDeliveryPreviewHtml("Cliente", eventDate, photoUrl);
  const customerEmail = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.equal(preview, customerEmail);
  assert.doesNotMatch(customerEmail, /aria-disabled|Agrega el enlace de las fotos/);
});

test("customer email is mobile-safe and contained on desktop", () => {
  const html = renderDigitalPhotoDeliveryHtml("Cliente", eventDate, photoUrl);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /width:100%/);
  assert.match(html, /max-width:620px/);
  assert.match(html, /max-width:100%/);
  assert.doesNotMatch(html, /min-width:[4-9][0-9]{2}px/);
});

test("plain-text fallback contains the same essential content", () => {
  const text = digitalPhotoDeliveryText("Cliente", eventDate, photoUrl);
  assert.match(text, /Hola Cliente,/);
  assert.match(text, /10 días/);
  assert.match(text, new RegExp(photoUrl));
  assert.match(text, new RegExp(DIGITAL_PHOTO_REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /DETALLE DEL EVENTO|SALDO PENDIENTE/);
});

test("feature has no financial, Drive, Calendar, Storage or gallery mutations", () => {
  const feature = `${service}\n${actions}`;
  assert.doesNotMatch(feature, /invoice_payments|payment_ledger|accounts_receivable|paid_amount|outstanding_balance/);
  assert.doesNotMatch(feature, /calendar_sync|GoogleCalendar|drive_sync|GoogleDrive|storage\.from|documents/);
  assert.doesNotMatch(feature, /upload|createFolder|deleteFolder|gallery/);
});

test("feature does not touch or route through other certified email templates", () => {
  const feature = `${service}\n${actions}\n${control}`;
  assert.doesNotMatch(feature, /reservation-confirmation|collection-email|formal-quote|commercial-hub\/email/);
  assert.doesNotMatch(feature, /RESERVATION_CONFIRMATION|COLLECTION_EMAIL|QUOTATION/);
});

test("migration is additive, minimal and performs no historical execution", () => {
  assert.match(migration, /add column if not exists/);
  assert.match(migration, /create unique index if not exists/);
  assert.doesNotMatch(migration, /\b(update|delete|insert into|truncate)\b/i);
  assert.doesNotMatch(migration, /payment|invoice|calendar|drive|storage/i);
});
