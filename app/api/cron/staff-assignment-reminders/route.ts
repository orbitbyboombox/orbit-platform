import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { buildStaffD1ReminderEmail } from "@/features/staff-communications/staff-email.templates";
import {
  chileTomorrow,
  isChileD1ReminderWindow,
  isSpecialOperationalStaffId,
  operationalD1Candidates,
  operationalReminderCorrelation,
  SPECIAL_OPERATIONAL_STAFF_MESSAGE,
} from "@/features/operations/special-operational-staff-reminder.model";

const localParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date),
    get = (type: string) =>
      parts.find((item) => item.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
};
const localMinutes = (date: string, time: string) =>
  Date.parse(`${date}T${time.slice(0, 5)}:00Z`) / 60000;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected)
    return NextResponse.json(
      { error: "Cron is not configured." },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${expected}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient(),
    reference = new Date(),
    now = localParts(reference),
    today = now.date,
    tomorrow = chileTomorrow(reference),
    end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 3);
  const { data: logisticsAlerts, error: logisticsAlertError } = await admin.rpc(
    "refresh_logistics_notifications",
    { p_reference: reference.toISOString() },
  );
  if (logisticsAlertError)
    return NextResponse.json(
      { error: logisticsAlertError.message },
      { status: 500 },
    );
  const { data, error } = await admin
    .from("assignments")
    .select(
      "id,project_id,staff_id,assignment_type,status,deleted_at,staff_call_at,staff(first_name,email,status,deleted_at),projects(id,name,customer_id,event_date,event_time,location,city,status,deleted_at,customers(full_name))",
    )
    .is("deleted_at", null)
    .in("status", [
      "PENDING",
      "PENDING_CONFIRMATION",
      "ASSIGNED",
      "CONFIRMED",
      "ACCEPTED",
    ])
    .gte("projects.event_date", today)
    .lte("projects.event_date", end.toISOString().slice(0, 10));
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // C.5 paper closeout reminder. This uses the existing notification/email
  // channel and claims a unique correlation before invoking the provider.
  let paperDelivered = 0;
  const { data: paperSnapshots, error: paperError } = await admin
    .from("event_paper_snapshots")
    .select("id,project_id,asset_assignment_id,status,paper_required,reminder_sent_at")
    .eq("paper_required", true)
    .in("status", ["PENDING", "READY_TO_CLOSE"])
    .is("reminder_sent_at", null);
  if (paperError && paperError.code !== "42P01")
    return NextResponse.json({ error: paperError.message }, { status: 500 });
  for (const snapshot of paperSnapshots ?? []) {
    if (!snapshot.project_id || !snapshot.asset_assignment_id) continue;
    const [{ data: assignment }, { data: project }] = await Promise.all([
      admin.from("assignments").select("staff_id,status,deleted_at,assignment_type,staff(first_name,email,status,deleted_at)").eq("project_id", snapshot.project_id).eq("assignment_type", "OPERATOR").is("deleted_at", null).in("status", ["CONFIRMED", "ACCEPTED", "COMPLETED"]).limit(1).maybeSingle(),
      admin.from("projects").select("id,customer_id,name,event_date,event_time,status,deleted_at,project_services(duration_hours)").eq("id", snapshot.project_id).maybeSingle(),
    ]);
    const staff = (assignment?.staff && Array.isArray(assignment.staff) ? assignment.staff[0] : assignment?.staff) as { first_name?: string; email?: string } | null;
    const projectRecord = project as typeof project & { project_services?: Array<{ duration_hours?: number }> };
    if (!assignment?.staff_id || !staff?.email || !projectRecord || projectRecord.deleted_at) continue;
    if (["CANCELLED", "CANCELED", "ARCHIVED", "CLOSED"].includes(String(projectRecord.status ?? "").toUpperCase())) continue;
    const duration = Number(projectRecord.project_services?.[0]?.duration_hours ?? 0);
    const endMinutes = localMinutes(projectRecord.event_date, projectRecord.event_time ?? "00:00") + duration * 60;
    const nowMinutes = localMinutes(now.date, now.time);
    if (nowMinutes < endMinutes - 5 || nowMinutes >= endMinutes) continue;
    const correlation = `staff-paper-closeout:${snapshot.id}:${assignment.staff_id}`;
    const { data: inserted, error: insertError } = await admin.from("internal_notifications").upsert({
      project_id: projectRecord.id, customer_id: projectRecord.customer_id, staff_id: assignment.staff_id,
      notification_type: "STAFF_PAPER_CLOSEOUT_REMINDER", title: "RECUERDA CERRAR TU EVENTO",
      message: "Antes de retirarte, ingresa en tu Portal la cantidad de papel que quedó en la impresora. Este dato actualizará automáticamente el consumo del evento y el inventario de la Caja Negra asignada.",
      status: "UNREAD", correlation_id: correlation, category: "OPERATIONS", priority: "HIGH",
      action_required: true, entity_type: "EventPaperSnapshot", entity_id: snapshot.id,
      related_href: `/staff-portal?event=${projectRecord.id}#paper`, metadata: { reminder: "PAPER_CLOSEOUT_MINUS_5" },
    }, { onConflict: "correlation_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (insertError || !inserted) continue;
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl";
      const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({
        to: staff.email, subject: "RECUERDA CERRAR TU EVENTO",
        textBody: `Hola ${staff.first_name ?? ""}.\n\nRECUERDA CERRAR TU EVENTO\n\nAntes de retirarte, ingresa en tu Portal la cantidad de papel que quedó en la impresora.\n\nEste dato actualizará automáticamente el consumo del evento y el inventario de la Caja Negra asignada.\n\nINGRESAR PAPEL RESTANTE: ${appUrl}/staff-portal?event=${projectRecord.id}#paper`,
        htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6"><h1>RECUERDA CERRAR TU EVENTO</h1><p>Antes de retirarte, ingresa en tu Portal la cantidad de papel que quedó en la impresora.</p><p>Este dato actualizará automáticamente el consumo del evento y el inventario de la Caja Negra asignada.</p><p><a href="${appUrl}/staff-portal?event=${projectRecord.id}#paper">INGRESAR PAPEL RESTANTE</a></p></main>`, driveFileIds: [], idempotencyKey: correlation, maxSendAttempts: 1,
      });
      await admin.from("internal_notifications").update({ metadata: { reminder: "PAPER_CLOSEOUT_MINUS_5", email_status: "SENT", message_id: sent.messageId } }).eq("id", inserted.id);
      await admin.from("event_paper_snapshots").update({ reminder_sent_at: reference.toISOString() }).eq("id", snapshot.id).is("reminder_sent_at", null);
      paperDelivered++;
    } catch (sendError) {
      await admin.from("internal_notifications").update({ metadata: { reminder: "PAPER_CLOSEOUT_MINUS_5", email_status: "FAILED", error: sendError instanceof Error ? sendError.message : "Unknown" } }).eq("id", inserted.id);
    }
  }

  // Other Staff retain assignment-based 48/2-hour emails; D-1 is the single
  // person/event communication below so multiple roles cannot duplicate it.
  let delivered = 0;
  for (const row of data ?? []) {
    if (isSpecialOperationalStaffId(row.staff_id)) continue;
    const project = Array.isArray(row.projects)
        ? row.projects[0]
        : row.projects,
      staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
    if (!project || !staff?.email) continue;
    const call = row.staff_call_at ? new Date(row.staff_call_at) : null,
      difference = call
        ? Math.round((call.getTime() - Date.now()) / 60000)
        : localMinutes(project.event_date, project.event_time ?? "00:00") -
          localMinutes(now.date, now.time),
      window = [48, 2].find(
        (hours) => difference <= hours * 60 && difference > hours * 60 - 65,
      );
    if (!window) continue;
    const correlation = `staff-assignment-reminder:${row.id}:${window}`,
      title =
        window === 2
          ? "Hora de salir al Evento"
          : `Recordatorio de Evento · ${window} horas`,
      maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${project.location ?? ""}, ${project.city ?? ""}`)}`;
    const { data: inserted } = await admin
      .from("internal_notifications")
      .upsert(
        {
          project_id: project.id,
          customer_id: project.customer_id,
          staff_id: row.staff_id,
          notification_type: "STAFF_ASSIGNMENT_REMINDER",
          title,
          message: `${project.event_date} ${project.event_time?.slice(0, 5) ?? ""} · ${project.name}`,
          status: "UNREAD",
          correlation_id: correlation,
          category: "OPERATIONS",
          priority: window === 2 ? "HIGH" : "NORMAL",
          action_required: window === 2,
          entity_type: "Assignment",
          entity_id: row.id,
          related_href: "/staff-portal",
          metadata: { hours_before: window, maps },
        },
        { onConflict: "correlation_id", ignoreDuplicates: true },
      )
      .select("id");
    if (!inserted?.length) continue;
    try {
      const sent = await new GoogleGmailApiProvider(
        await loadGoogleWorkspaceAccessToken(),
      ).send({
        to: staff.email,
        subject: title,
        textBody: `Hola ${staff.first_name}. ${project.name} comienza en ${window} horas.\nFecha: ${project.event_date}\nHora: ${project.event_time?.slice(0, 5)}\nUbicación: ${project.location ?? "Por confirmar"}\nRuta: ${maps}\nPortal Staff: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl"}/login?access=staff`,
        htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6"><h1>${title}</h1><p>Hola ${staff.first_name}, revisa tu paquete operacional en Portal Staff.</p><p><strong>${project.event_date} · ${project.event_time?.slice(0, 5)}</strong><br>${project.location ?? "Ubicación por confirmar"}</p><p><a href="${maps}">Iniciar navegación</a></p></main>`,
        driveFileIds: [],
      });
      await admin
        .from("internal_notifications")
        .update({
          metadata: {
            hours_before: window,
            maps,
            email_status: "SENT",
            message_id: sent.messageId,
          },
        })
        .eq("id", inserted[0].id);
      delivered++;
    } catch (sendError) {
      await admin
        .from("internal_notifications")
        .update({
          metadata: {
            hours_before: window,
            maps,
            email_status: "FAILED",
            error: sendError instanceof Error ? sendError.message : "Unknown",
          },
        })
        .eq("id", inserted[0].id);
    }
  }

  const operationalRows = (data ?? []).flatMap((row) => {
    const project = Array.isArray(row.projects)
        ? row.projects[0]
        : row.projects,
      staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
    if (!project || !staff) return [];
    return [
      {
        projectId: project.id,
        staffId: row.staff_id,
        assignmentStatus: row.status,
        assignmentDeletedAt: row.deleted_at,
        eventDate: project.event_date,
        projectStatus: project.status,
        projectDeletedAt: project.deleted_at,
        staffStatus: staff.status,
        staffDeletedAt: staff.deleted_at,
        email: staff.email,
        customerId: project.customer_id,
        firstName: staff.first_name,
        eventName: project.name,
        eventTime: project.event_time,
        location:
          [project.location, project.city].filter(Boolean).join(" · ") || null,
        role: row.assignment_type,
      },
    ];
  });
  let specialDelivered = 0,
    specialFailed = 0;
  if (isChileD1ReminderWindow(reference))
    for (const candidate of operationalD1Candidates(
      operationalRows,
      tomorrow,
    )) {
      // No independent schedule: the current event date and active assignment
      // are checked again immediately before claiming the person/event notice.
      const [
        { data: active, error: activeError },
        { data: currentProject, error: projectError },
      ] = await Promise.all([
        admin
          .from("assignments")
          .select("id")
          .eq("project_id", candidate.projectId)
          .eq("staff_id", candidate.staffId)
          .is("deleted_at", null)
          .in("status", [
            "PENDING",
            "PENDING_CONFIRMATION",
            "ASSIGNED",
            "CONFIRMED",
            "ACCEPTED",
          ])
          .limit(1),
        admin
          .from("projects")
          .select("event_date,status,deleted_at")
          .eq("id", candidate.projectId)
          .single(),
      ]);
      if (activeError || projectError) {
        specialFailed++;
        console.error("[ORBIT][STAFF_SPECIAL_D1] canonical check failed", {
          projectId: candidate.projectId,
          staffId: candidate.staffId,
          error: activeError?.message ?? projectError?.message,
        });
        continue;
      }
      if (
        !active?.length ||
        !currentProject ||
        currentProject.event_date !== tomorrow ||
        currentProject.deleted_at ||
        ["CANCELLED", "CANCELED", "CLOSED", "ARCHIVED"].includes(
          String(currentProject.status ?? "").toUpperCase(),
        )
      )
        continue;
      // A D-1 email sent by the old per-role flow before cutover cannot be
      // recalled. Do not add another D-1 email for that person/event.
      const { data: legacyD1, error: legacyError } = await admin
        .from("internal_notifications")
        .select("id")
        .eq("project_id", candidate.projectId)
        .eq("staff_id", candidate.staffId)
        .eq("notification_type", "STAFF_ASSIGNMENT_REMINDER")
        .contains("metadata", { hours_before: 24, email_status: "SENT" })
        .limit(1);
      if (legacyError) {
        specialFailed++;
        console.error("[ORBIT][STAFF_SPECIAL_D1] legacy check failed", {
          projectId: candidate.projectId,
          staffId: candidate.staffId,
          error: legacyError.message,
        });
        continue;
      }
      if (legacyD1?.length) continue;
      const correlation = operationalReminderCorrelation(
        candidate.projectId,
        candidate.staffId,
      );
      const { data: claimed, error: claimError } = await admin
        .from("internal_notifications")
        .upsert(
          {
            project_id: candidate.projectId,
            customer_id: candidate.customerId,
            staff_id: candidate.staffId,
            notification_type: isSpecialOperationalStaffId(candidate.staffId)
              ? "STAFF_SPECIAL_D1_REMINDER"
              : "STAFF_D1_REMINDER",
            title: SPECIAL_OPERATIONAL_STAFF_MESSAGE,
            message: `${candidate.eventName} · ${candidate.roles.join(" + ")}`,
            status: "UNREAD",
            correlation_id: correlation,
            category: "STAFF",
            priority: "NORMAL",
            action_required: false,
            entity_type: "Project",
            entity_id: candidate.projectId,
            related_href: "/staff-portal",
            metadata: {
              email_status: "CLAIMED",
              event_date: tomorrow,
              roles: candidate.roles,
              delivery_window: "19:00-20:00 America/Santiago",
            },
          },
          { onConflict: "correlation_id", ignoreDuplicates: true },
        )
        .select("id");
      if (claimError) {
        specialFailed++;
        console.error("[ORBIT][STAFF_SPECIAL_D1] claim failed", {
          projectId: candidate.projectId,
          staffId: candidate.staffId,
          error: claimError.message,
        });
        continue;
      }
      if (!claimed?.length) continue; // Unique correlation protects multirole and concurrent cron invocations.
      try {
        const email = buildStaffD1ReminderEmail({
          appUrl:
            process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl",
          firstName: candidate.firstName,
          eventName: candidate.eventName,
          eventDate: candidate.eventDate,
          roles: candidate.roles,
          eventTime: candidate.eventTime,
          location: candidate.location,
        });
        const sent = await new GoogleGmailApiProvider(
          await loadGoogleWorkspaceAccessToken(),
        ).send({
          to: candidate.email!,
          subject: email.subject,
          textBody: email.textBody,
          htmlBody: email.htmlBody,
          driveFileIds: [],
          idempotencyKey: correlation,
          maxSendAttempts: 1,
        });
        const { error: updateError } = await admin
          .from("internal_notifications")
          .update({
            metadata: {
              email_status: "SENT",
              event_date: tomorrow,
              message_id: sent.messageId,
              sent_at: new Date().toISOString(),
              roles: candidate.roles,
              delivery_window: "19:00-20:00 America/Santiago",
            },
          })
          .eq("id", claimed[0].id);
        if (updateError) throw updateError;
        specialDelivered++;
      } catch (sendError) {
        // An ambiguous Gmail response is never auto-retried; manual reconciliation
        // is safer than risking a duplicate external message.
        specialFailed++;
        await admin
          .from("internal_notifications")
          .update({
            metadata: {
              email_status: "FAILED_REQUIRES_RECONCILIATION",
              event_date: tomorrow,
              error: sendError instanceof Error ? sendError.message : "Unknown",
            },
          })
          .eq("id", claimed[0].id);
        console.error("[ORBIT][STAFF_SPECIAL_D1] send failed", {
          projectId: candidate.projectId,
          staffId: candidate.staffId,
          error: sendError instanceof Error ? sendError.message : "Unknown",
        });
      }
    }
  return NextResponse.json(
    {
      ok: specialFailed === 0,
      delivered,
      paperDelivered,
      d1Delivered: specialDelivered,
      d1Failed: specialFailed,
      specialDelivered,
      specialFailed,
      logisticsAlerts: Number(logisticsAlerts ?? 0),
    },
    { status: specialFailed ? 500 : 200 },
  );
}
