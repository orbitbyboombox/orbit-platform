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

  const company = await loadCompanySettings(client),
    configured = company.emailConfiguration.founderNotificationEmail,
    founderRecipient =
      (typeof configured === "string" ? configured : "") ||
      company.operationsEmail ||
      company.salesEmail ||
      company.supportEmail,
    recipients = [
      { email: founderRecipient, founder: true },
      ...(cancellation.initiated_by === "FOUNDER"
        ? [{ email: staff?.email ?? "", founder: false }]
        : []),
    ].filter(
      (item, index, all) =>
        Boolean(item.email) &&
        all.findIndex((candidate) => candidate.email === item.email) === index,
    );
  if (!recipients.length) {
    await client
      .from("staff_assignment_cancellations")
      .update({
        email_status: "NOT_CONFIGURED",
        email_error: "No existe destinatario configurado.",
      })
      .eq("id", cancellationId);
    return { status: "NOT_CONFIGURED" as const };
  }

  const rows = [
      ["Evento", project?.name ?? "Evento BOOMBOX"],
      ["Cliente", customer?.full_name ?? "Sin cliente"],
      ["Servicio", service],
      ["Fecha", project?.event_date ?? "Por confirmar"],
      ["Horario", schedule],
      ["Responsabilidad", role(cancellation.responsibility)],
      ["Staff", `${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim()],
      ["Motivo", reason],
    ];
  const accessToken = await loadGoogleWorkspaceAccessToken(),
    provider = new GoogleGmailApiProvider(accessToken),
    sentIds: string[] = [],
    failures: string[] = [];
  for (const recipient of recipients) {
    const subject = recipient.founder
        ? "🚨 URGENT · Staff Assignment Cancelled"
        : "Tu asignación BOOMBOX fue cancelada",
      heading = recipient.founder
        ? "URGENTE · Asignación de Staff cancelada"
        : "Asignación cancelada por BOOMBOX",
      textBody = [heading,...rows.map(([label,value])=>`${label}: ${value}`),eventUrl].join("\n"),
      htmlBody = `<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><h1>${escapeHtml(heading)}</h1><table style="border-collapse:collapse">${rows.map(([label,value])=>`<tr><td style="padding:7px 12px;color:#666">${escapeHtml(label)}</td><td style="padding:7px 12px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("")}</table><p><a href="${eventUrl}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Abrir Evento en ORBIT</a></p></main>`;
    let delivered = false,
      lastError = "";
    for (let attempt=1;attempt<=3;attempt+=1) {
      try {
        const sent=await provider.send({to:recipient.email,subject,textBody,htmlBody,driveFileIds:[]});
        sentIds.push(sent.messageId);
        delivered=true;
        break;
      } catch(emailError) {
        lastError=emailError instanceof Error?emailError.message:String(emailError);
      }
    }
    if(!delivered) failures.push(`${recipient.email}: ${lastError}`);
  }
  await client
    .from("staff_assignment_cancellations")
    .update({
      email_recipient: recipients.map((item)=>item.email).join(", "),
      email_status: failures.length ? "FAILED" : "SENT",
      email_message_id: sentIds.join(","),
      email_error: failures.length ? failures.join(" | ") : null,
      email_sent_at: sentIds.length ? new Date().toISOString() : null,
    })
    .eq("id", cancellationId);
  return failures.length
    ? { status: "FAILED" as const }
    : { status: "SENT" as const, messageId: sentIds.join(",") };
}

type BoundaryStage = "portal" | "timeline" | "notification" | "email";
type BoundaryResult = {
  completed: BoundaryStage[];
  failed: Array<{ stage: BoundaryStage; error: string }>;
};

/**
 * Boundary B runs strictly after the cancellation RPC has committed. Each
 * projection is isolated so Timeline, Portal or email can never invalidate the
 * canonical Assignment cancellation and its Settlement recalculation.
 */
export async function deliverAssignmentCancellationBoundary(
  client: SupabaseClient,
  cancellationId: string,
): Promise<BoundaryResult> {
  const { data: cancellation, error } = await client
    .from("staff_assignment_cancellations")
    .select(
      "id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail,cancelled_by,republish_allowed,projects(customer_id,orbit_event_id)",
    )
    .eq("id", cancellationId)
    .single();
  if (error || !cancellation)
    throw error ?? new Error("Cancelación no encontrada para Boundary B.");

  const project = Array.isArray(cancellation.projects)
      ? cancellation.projects[0]
      : cancellation.projects,
    reason = [cancellation.reason_category, cancellation.reason_detail]
      .filter(Boolean)
      .join(" · "),
    founderInitiated = cancellation.initiated_by === "FOUNDER",
    completed: BoundaryStage[] = [],
    failed: BoundaryResult["failed"] = [];
  const run = async (stage: BoundaryStage, operation: () => Promise<void>) => {
    try {
      await operation();
      completed.push(stage);
    } catch (stageError) {
      const message =
        stageError instanceof Error ? stageError.message : String(stageError);
      failed.push({ stage, error: message });
      console.error("[ORBIT][STAFF_CANCELLATION_BOUNDARY]", {
        cancellationId,
        stage,
        error: message,
      });
    }
  };

  await run("portal", async () => {
    if (!cancellation.republish_allowed) return;
    const { error: portalError } = await client
      .from("staff_event_publications")
      .upsert(
        {
          project_id: cancellation.project_id,
          published: true,
          published_at: new Date().toISOString(),
          published_by: cancellation.cancelled_by,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );
    if (portalError) throw portalError;
  });

  await run("timeline", async () => {
    const action = founderInitiated
        ? "STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER"
        : "STAFF_ASSIGNMENT_CANCELLED",
      message = founderInitiated
        ? "Founder canceló la asignación y el Evento volvió a requerir cobertura."
        : "URGENTE: Staff canceló su asignación. El Evento volvió a requerir cobertura.";
    const { error: timelineError } = await client.from("timeline_events").upsert(
      {
        customer_id: project?.customer_id,
        project_id: cancellation.project_id,
        staff_id: cancellation.staff_id,
        orbit_event_id: project?.orbit_event_id,
        event_type: action,
        title: founderInitiated
          ? "Founder canceló una asignación"
          : "Staff canceló una asignación",
        description: reason,
        actor_id: cancellation.cancelled_by,
        actor_label: founderInitiated ? "Founder" : "Staff",
        source: founderInitiated ? "EventWorkspace" : "StaffPortal",
        action,
        entity_type: "StaffAssignmentCancellation",
        entity_id: cancellation.id,
        human_message: message,
        correlation_id: `staff-assignment-cancellation:${cancellation.id}`,
        reason,
        created_by: cancellation.cancelled_by,
      },
      { onConflict: "correlation_id" },
    );
    if (timelineError) throw timelineError;
  });

  await run("notification", async () => {
    const { error: notificationError } = await client
      .from("internal_notifications")
      .upsert(
        {
          project_id: cancellation.project_id,
          customer_id: project?.customer_id,
          staff_id: cancellation.staff_id,
          notification_type: founderInitiated
            ? "STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER"
            : "STAFF_ASSIGNMENT_CANCELLED",
          title: founderInitiated
            ? "Asignación cancelada por BOOMBOX"
            : "URGENTE · Staff canceló un Evento",
          message: reason,
          status: "UNREAD",
          correlation_id: `staff-assignment-cancellation-alert:${cancellation.id}`,
          category: founderInitiated ? "STAFF" : "OPERATIONS",
          priority: "CRITICAL",
          action_required: true,
          entity_type: "StaffAssignmentCancellation",
          entity_id: cancellation.id,
          related_href: founderInitiated
            ? "/staff-portal"
            : `/projects/${cancellation.project_id}`,
          metadata: {
            responsibility: cancellation.responsibility,
            republished: Boolean(cancellation.republish_allowed && completed.includes("portal")),
          },
        },
        { onConflict: "correlation_id" },
      );
    if (notificationError) throw notificationError;
  });

  await run("email", async () => {
    const delivery = await deliverAssignmentCancellationEmail(
      client,
      cancellationId,
    );
    if (delivery.status === "FAILED")
      throw new Error("El proveedor rechazó el correo después de 3 intentos.");
  });
  return { completed, failed };
}
