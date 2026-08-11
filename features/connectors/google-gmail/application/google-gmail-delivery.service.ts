import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettings } from "@/features/company-settings";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";

const currency = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export async function deliverConfirmedReservationEmail(input: { projectId: string; actorId: string; portal?: { url: string; expiresAt: string } }): Promise<{ status: "SENT" | "PENDING"; messageId?: string }> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("communications").select("id,status,external_message_id").eq("project_id", input.projectId).eq("channel", "GMAIL").eq("communication_type", "RESERVATION_CONFIRMATION").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "SENT" && existing.external_message_id) return { status: "SENT", messageId: existing.external_message_id };
  const [{ data: project, error: projectError }, { data: agreement, error: agreementError }, company] = await Promise.all([
    admin.from("projects").select("id,customer_id,orbit_event_id,name,project_type,event_date,event_time,location,city,finance,operations,customers!inner(full_name,email,phone),project_services(service_code,duration_hours,extras),quotations(grand_total,final_customer_price,transport_total,discount_total)").eq("id", input.projectId).is("deleted_at", null).single(),
    admin.from("agreements").select("id,status,drive_file_id").eq("project_id", input.projectId).eq("status", "SIGNED").not("drive_file_id", "is", null).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
    loadCompanySettings(admin),
  ]);
  if (projectError) throw projectError;
  if (agreementError) throw agreementError;
  if (!agreement?.drive_file_id) return { status: "PENDING" };
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  if (!customer?.email) throw new Error("El cliente no tiene correo electrónico.");
  const services = project.project_services ?? [];
  const quotation = Array.isArray(project.quotations) ? project.quotations[0] : project.quotations;
  const finance = project.finance && typeof project.finance === "object" ? project.finance as Record<string, unknown> : {};
  const operations = project.operations && typeof project.operations === "object" ? project.operations as Record<string, unknown> : {};
  const total = Number(quotation?.final_customer_price ?? quotation?.grand_total ?? finance.total ?? 0);
  const reservation = Number(finance.reservation ?? finance.deposit ?? Math.round(total / 2));
  const balance = Number(finance.remainingBalance ?? finance.balance ?? Math.max(0, total - reservation));
  const transport = Number(quotation?.transport_total ?? finance.transport ?? 0);
  const extras = Array.from(new Set(services.flatMap((service) => Array.isArray(service.extras) ? service.extras.filter((item): item is string => typeof item === "string") : [])));
  const serviceLines = services.map((service) => `${service.service_code} · ${Number(service.duration_hours ?? 0)} horas`);
  const portal = input.portal ?? await createCustomerPortalAccess(project.id, input.actorId);
  const subject = "🎉 Tu reserva BOOMBOX ha sido confirmada";
  const summaryRows = [...serviceLines.map((line) => ["Servicio", line]), ["Extras", extras.join(", ") || "Sin extras"], ["Transporte", currency(transport)], ["Reserva", currency(reservation)], ["Saldo restante", currency(balance)], ["TOTAL", currency(total)]];
  const summaryHtml = summaryRows.map(([label, value]) => `<tr><td style="padding:8px 12px;color:#666">${escapeHtml(label)}</td><td style="padding:8px 12px;text-align:right;font-weight:600">${escapeHtml(value)}</td></tr>`).join("");
  const eventAddress = String((operations.notes ?? "").toString().match(/Dirección evento:\s*([^\n]+)/)?.[1] ?? project.city ?? "Por confirmar");
  const operationalContact = String((operations.notes ?? "").toString().match(/Contacto operacional:\s*([^\n]+)/)?.[1] ?? "Equipo BOOMBOX");
  const portalButton = `<p style="margin:32px 0"><a href="${escapeHtml(portal.url)}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">🟠 Ingresar a Mi Evento</a></p>`;
  const htmlBody = `<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><p>Hola ${escapeHtml(customer.full_name)},</p><h1 style="font-size:24px">🎉 BIENVENIDOS A BOOMBOX</h1><p>La reserva ha sido confirmada correctamente.</p><p>Adjuntamos el contrato firmado. Desde este momento, toda la información esencial del evento está disponible en Mi Evento.</p><table style="width:100%;max-width:560px;border-collapse:collapse">${summaryHtml}</table><h3>Información del evento</h3><p>Fecha: ${escapeHtml(project.event_date)}<br>Hora: ${escapeHtml(project.event_time?.slice(0, 5) ?? "Por confirmar")}<br>Lugar del evento: ${escapeHtml(project.location ?? "Por confirmar")}<br>Dirección: ${escapeHtml(eventAddress)}<br>Contacto operacional: ${escapeHtml(operationalContact)}</p>${portalButton}<p>${escapeHtml(company.brandName)}<br><a href="${escapeHtml(company.website)}">${escapeHtml(company.website)}</a>${company.phone ? `<br>WhatsApp: ${escapeHtml(company.phone)}` : ""}</p></main>`;
  const textBody = [`Hola ${customer.full_name},`, "🎉 BIENVENIDOS A BOOMBOX", "La reserva ha sido confirmada correctamente.", "Adjuntamos el contrato firmado.", ...summaryRows.map(([label, value]) => `${label}: ${value}`), `Fecha: ${project.event_date}`, `Hora: ${project.event_time?.slice(0, 5) ?? "Por confirmar"}`, `Lugar del evento: ${project.location ?? "Por confirmar"}`, `Dirección: ${eventAddress}`, `Contacto operacional: ${operationalContact}`, `🟠 Ingresar a Mi Evento: ${portal.url}`, company.website].filter(Boolean).join("\n\n");
  let communicationId = existing?.id;
  if (communicationId) { const { error } = await admin.from("communications").update({ status: "QUEUED", subject, body: textBody, created_by: input.actorId }).eq("id", communicationId); if (error) throw error; }
  else { const { data, error } = await admin.from("communications").insert({ customer_id: project.customer_id, project_id: project.id, channel: "GMAIL", direction: "OUTBOUND", communication_type: "RESERVATION_CONFIRMATION", thread_key: `reservation:${project.id}`, subject, body: textBody, status: "QUEUED", created_by: input.actorId }).select("id").single(); if (error) throw error; communicationId = data.id; }
  try {
    const result = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: customer.email, subject, textBody, htmlBody, driveFileIds: [agreement.drive_file_id] });
    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin.from("communications").update({ status: "SENT", thread_key: result.threadId, external_message_id: result.messageId, occurred_at: sentAt }).eq("id", communicationId); if (updateError) throw updateError;
    const message = "Confirmación oficial de reserva enviada por Gmail.";
    const { error: timelineError } = await admin.from("timeline_events").insert({ customer_id: project.customer_id, project_id: project.id, communication_id: communicationId, event_type: "RESERVATION_CONFIRMATION_SENT", title: message, description: message, orbit_event_id: project.orbit_event_id, actor_id: input.actorId, actor_label: "Administrador", source: "Gmail", action: "RESERVATION_CONFIRMATION_SENT", entity_type: "Communication", entity_id: communicationId, human_message: message, correlation_id: `gmail:reservation:${project.id}`, created_by: input.actorId }); if (timelineError) throw timelineError;
    return { status: "SENT", messageId: result.messageId };
  } catch (error) {
    await admin.from("communications").update({ status: "FAILED", occurred_at: new Date().toISOString() }).eq("id", communicationId);
    throw error;
  }
}

export async function deliverFounderReservationNotification(input: { projectId: string; actorId: string }): Promise<{ status: "SENT" | "SKIPPED"; messageId?: string }> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("communications").select("id,status,external_message_id").eq("project_id", input.projectId).eq("channel", "GMAIL").eq("communication_type", "INTERNAL_NOTIFICATION").eq("thread_key", `founder-reservation:${input.projectId}`).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "SENT") return { status: "SKIPPED", messageId: existing.external_message_id ?? undefined };
  const [{ data: project, error: projectError }, { data: calendar }, { count: portalCount }, company] = await Promise.all([
    admin.from("projects").select("id,customer_id,orbit_event_id,name,event_date,finance,operations,customers!inner(full_name),project_services(service_code),agreements(status,drive_file_id),quotations(quotation_number,final_customer_price)").eq("id", input.projectId).is("deleted_at", null).single(),
    admin.from("calendar_sync").select("external_event_id").eq("project_id", input.projectId).maybeSingle(),
    admin.from("customer_portal_tokens").select("id", { count: "exact", head: true }).eq("project_id", input.projectId).is("revoked_at", null),
    loadCompanySettings(admin),
  ]);
  if (projectError) throw projectError;
  const configuredFounderEmail=typeof company.emailConfiguration.founderNotificationEmail==="string"?company.emailConfiguration.founderNotificationEmail:"";
  const recipient = configuredFounderEmail || company.operationsEmail || company.salesEmail || company.supportEmail;
  if (!recipient) throw new Error("No existe un correo interno configurado para notificar al Founder.");
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  const quotation = Array.isArray(project.quotations) ? project.quotations[0] : project.quotations;
  const agreement = Array.isArray(project.agreements) ? project.agreements[0] : project.agreements;
  const operations = project.operations && typeof project.operations === "object" ? project.operations as Record<string, unknown> : {};
  const drive = operations.googleDrive && typeof operations.googleDrive === "object" ? operations.googleDrive as Record<string, unknown> : {};
  const amount = Number(quotation?.final_customer_price ?? (project.finance as Record<string, unknown> | null)?.total ?? 0);
  const verification = [
    ["Customer", Boolean(customer?.full_name)], ["Project", Boolean(project.id)], ["Event360", Boolean(project.orbit_event_id)],
    ["Google Calendar", Boolean(calendar?.external_event_id)], ["Google Drive", Boolean(drive.folderId)], ["Portal", Boolean(portalCount)],
    ["Finance", amount > 0], ["Dashboard", true], ["Contract", agreement?.status === "SIGNED" && Boolean(agreement.drive_file_id)],
  ] as const;
  const subject = `🎉 Nueva reserva confirmada · ${quotation?.quotation_number ?? project.orbit_event_id}`;
  const rows = [["Cliente", customer?.full_name ?? "Sin cliente"], ["Servicio", (project.project_services ?? []).map((item) => item.service_code).join(" + ") || "Sin servicio"], ["Fecha", project.event_date], ["Reserva", quotation?.quotation_number ?? project.orbit_event_id], ["Monto", currency(amount)]];
  const htmlBody = `<main style="font-family:Arial,sans-serif;color:#171717"><h1>Reserva completada</h1><table style="border-collapse:collapse">${rows.map(([label,value])=>`<tr><td style="padding:7px 12px;color:#666">${escapeHtml(String(label))}</td><td style="padding:7px 12px;font-weight:700">${escapeHtml(String(value))}</td></tr>`).join("")}</table><h2>Verificación</h2><ul>${verification.map(([label,ready])=>`<li>${ready?"✅":"⚠️"} ${escapeHtml(label)}</li>`).join("")}</ul><p><a href="${appProjectUrl(project.id)}">Abrir Event360</a></p></main>`;
  const textBody = ["Reserva completada", ...rows.map(([label,value])=>`${label}: ${value}`), "Verificación", ...verification.map(([label,ready])=>`${ready?"OK":"PENDIENTE"} · ${label}`), appProjectUrl(project.id)].join("\n");
  const result = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: recipient, subject, textBody, htmlBody, driveFileIds: [] });
  const record = { customer_id: project.customer_id, project_id: project.id, channel: "GMAIL", direction: "OUTBOUND", communication_type: "INTERNAL_NOTIFICATION", thread_key: `founder-reservation:${project.id}`, subject, body: textBody, status: "SENT", external_message_id: result.messageId, occurred_at: new Date().toISOString(), created_by: input.actorId };
  const { error: writeError } = existing?.id ? await admin.from("communications").update(record).eq("id", existing.id) : await admin.from("communications").insert(record);
  if (writeError) throw writeError;
  return { status: "SENT", messageId: result.messageId };
}

function appProjectUrl(projectId: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";
  return `${origin}/projects/${projectId}`;
}
