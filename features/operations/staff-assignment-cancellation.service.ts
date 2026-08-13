import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { loadCompanySettings } from "@/features/company-settings/repository";

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
const role = (value: string) =>
  ({ OPERATOR: "Operador", ASSEMBLY: "Montaje", DISASSEMBLY: "Desmontaje" })[
    value
  ] ?? value;

export async function deliverAssignmentCancellationEmail(
  client: SupabaseClient,
  cancellationId: string,
) {
  const { data: cancellation, error } = await client
    .from("staff_assignment_cancellations")
    .select(
      "id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail,staff(first_name,last_name,email),projects(name,event_date,event_time,customer_id,customers(full_name),project_services(service_code,duration_hours))",
    )
    .eq("id", cancellationId)
    .single();
  if (error || !cancellation)
    throw error ?? new Error("Cancelación no encontrada.");
  const staff = Array.isArray(cancellation.staff)
      ? cancellation.staff[0]
      : cancellation.staff,
    project = Array.isArray(cancellation.projects)
      ? cancellation.projects[0]
      : cancellation.projects,
    customer = Array.isArray(project?.customers)
      ? project.customers[0]
      : project?.customers,
    services = Array.isArray(project?.project_services)
      ? project.project_services
      : [],
    service =
      services
        .map((item) => item.service_code)
        .filter(Boolean)
        .join(" + ") || "Servicio BOOMBOX",
    duration = Math.max(
      0,
      ...services.map((item) => Number(item.duration_hours ?? 0)),
    ),
    start = project?.event_time?.slice(0, 5) ?? "Por confirmar",
    schedule = duration ? `${start} · ${duration} horas` : start,
    reason = [cancellation.reason_category, cancellation.reason_detail]
      .filter(Boolean)
      .join(" · "),
    eventUrl = `${appUrl()}/projects/${cancellation.project_id}`;

  let recipient = staff?.email ?? "";
  if (cancellation.initiated_by === "STAFF") {
    const company = await loadCompanySettings(client),
      configured = company.emailConfiguration.founderNotificationEmail;
    recipient =
      (typeof configured === "string" ? configured : "") ||
      company.operationsEmail ||
      company.salesEmail ||
      company.supportEmail;
  }
  if (!recipient) {
    await client
      .from("staff_assignment_cancellations")
      .update({
        email_status: "NOT_CONFIGURED",
        email_error: "No existe destinatario configurado.",
      })
      .eq("id", cancellationId);
    return { status: "NOT_CONFIGURED" as const };
  }

  const founder = cancellation.initiated_by === "STAFF",
    subject = founder
      ? "URGENT · Staff cancelled an Event"
      : "Tu asignación BOOMBOX fue cancelada",
    heading = founder
      ? "URGENTE · Staff canceló un Evento"
      : "Asignación cancelada por BOOMBOX",
    rows = [
      ["Evento", project?.name ?? "Evento BOOMBOX"],
      ["Cliente", customer?.full_name ?? "Sin cliente"],
      ["Servicio", service],
      ["Fecha", project?.event_date ?? "Por confirmar"],
      ["Horario", schedule],
      ["Responsabilidad", role(cancellation.responsibility)],
      ["Staff", `${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim()],
      ["Motivo", reason],
    ],
    textBody = [
      heading,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      eventUrl,
    ].join("\n"),
    htmlBody = `<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><h1>${escapeHtml(heading)}</h1><table style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px;color:#666">${escapeHtml(label)}</td><td style="padding:7px 12px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("")}</table><p><a href="${eventUrl}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Abrir ORBIT</a></p></main>`;
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const sent = await new GoogleGmailApiProvider(
        await loadGoogleWorkspaceAccessToken(),
      ).send({ to: recipient, subject, textBody, htmlBody, driveFileIds: [] });
      await client
        .from("staff_assignment_cancellations")
        .update({
          email_recipient: recipient,
          email_status: "SENT",
          email_message_id: sent.messageId,
          email_error: null,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", cancellationId);
      return { status: "SENT" as const, messageId: sent.messageId };
    } catch (emailError) {
      lastError =
        emailError instanceof Error ? emailError.message : String(emailError);
    }
  }
  await client
    .from("staff_assignment_cancellations")
    .update({
      email_recipient: recipient,
      email_status: "FAILED",
      email_error: lastError,
    })
    .eq("id", cancellationId);
  return { status: "FAILED" as const };
}
