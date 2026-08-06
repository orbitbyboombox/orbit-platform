"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GoogleCalendarLive } from "./google-calendar-live";
import { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";
import { SupabaseGoogleCalendarSyncRepository } from "../repository/google-calendar-sync.repository";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { CalendarOperationalEventInput, CalendarOperationalEventType, GoogleCalendarSyncOperation } from "../types/google-calendar-live.types";

type Result = { ok: true; operation: string } | { ok: false; error: string };

export async function synchronizeProjectCalendarAction(projectId: string, operation: GoogleCalendarSyncOperation = "UPSERT"): Promise<Result> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para sincronizar el calendario.");
    const { data, error } = await client.from("projects").select("id,name,status,orbit_event_id,event_type,event_date,event_time,location,city,updated_at,notes,customers!inner(full_name,phone,email),project_services(service_code,duration_hours,extras),quotations(status),agreements(status),assignments(staff_id,assignment_type,status,staff(first_name,last_name)),asset_assignments(assignment_status,operational_assets(asset_code,asset_type))").eq("id", projectId).single();
    if (error) throw error;
    const project = data as unknown as {
      id:string; name:string; status:string; orbit_event_id:string; event_type:string; event_date:string; event_time:string; location:string|null; city:string|null; updated_at:string; notes:string|null;
      customers:{full_name:string;phone:string|null;email:string}; project_services:Array<{service_code:string;duration_hours:number|null;extras:unknown}>;
      quotations:Array<{status:string}>; agreements:Array<{status:string}>;
      assignments:Array<{assignment_type:string;status:string;staff:{first_name:string;last_name:string}|null}>;
      asset_assignments:Array<{assignment_status:string;operational_assets:{asset_code:string;asset_type:string}|null}>;
    };
    if (!project.quotations.some((item) => item.status === "ACCEPTED") || !project.agreements.some((item) => item.status === "SIGNED")) throw new Error("La cotización aprobada y el acuerdo firmado son necesarios para sincronizar el evento.");
    const service = project.project_services[0];
    const hours = service?.duration_hours ?? 3;
    const start = String(project.event_time ?? "18:00").slice(0,5);
    const [startHour,startMinute] = start.split(":").map(Number);
    const endMinutes = startHour * 60 + startMinute + hours * 60;
    const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2,"0")}:${String(endMinutes % 60).padStart(2,"0")}`;
    const operator = project.assignments.find((item) => item.assignment_type === "OPERATOR" && item.status !== "REJECTED")?.staff;
    const totem = project.asset_assignments.find((item) => item.assignment_status === "ASSIGNED" && item.operational_assets?.asset_type === "TOTEM")?.operational_assets?.asset_code;
    const assignedCase = project.asset_assignments.find((item) => item.assignment_status === "ASSIGNED" && item.operational_assets?.asset_type === "CASE")?.operational_assets?.asset_code;
    const eventType: CalendarOperationalEventType = /WEDDING|MATRIMONIO/i.test(project.event_type) ? "WEDDING" : /CORPORATE|EMPRESA/i.test(project.event_type) ? "CORPORATE" : /BIRTHDAY|CUMPLE/i.test(project.event_type) ? "BIRTHDAY" : /GRAD/i.test(project.event_type) ? "GRADUATION" : "INTERNAL";
    const extras = project.project_services.flatMap((item) => Array.isArray(item.extras) ? item.extras.filter((value): value is string => typeof value === "string") : []);
    const input: CalendarOperationalEventInput = {
      orbitEventId: project.orbit_event_id, planId: project.id, planStatus: "APPROVED", sequence: 1, eventId: project.id,
      customerName: project.customers.full_name, customerPhone: project.customers.phone ?? "Sin teléfono", customerEmail: project.customers.email,
      eventType, service: service?.service_code ?? "Servicio por confirmar", contractedHours: hours, eventDate: project.event_date,
      operator: operator ? `${operator.first_name} ${operator.last_name}` : "Pendiente de asignación", blackBox: totem ?? "Pendiente", booth: assignedCase ?? "Pendiente", assignedVehicle: "Pendiente",
      operatorCallTime: `${String((startHour + 23) % 24).padStart(2,"0")}:${String(startMinute).padStart(2,"0")}`, mountingWindow: "45 minutos", serviceStart: start, serviceEnd: end, dismantlingWindow: "30 minutos",
      operationalNotes: project.notes ?? "Sin notas operacionales", extras, customerAddress: [project.location,project.city].filter(Boolean).join(", ") || "Dirección pendiente",
      portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit-platform-v1.vercel.app"}/projects/${project.id}`, orbitProjectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit-platform-v1.vercel.app"}/projects/${project.id}`, updatedAt: project.updated_at,
    };
    const engine = new GoogleCalendarLive(await loadGoogleWorkspaceConnection(), new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken()), new SupabaseGoogleCalendarSyncRepository(client));
    const result = await engine.synchronize(input, operation);
    if (!result.ok) throw new Error(result.error.message);
    const messages = { CREATED: "Evento creado en Google Calendar.", UPDATED: "Evento actualizado en Google Calendar.", UNCHANGED: "Google Calendar ya estaba sincronizado.", CANCELLED: "Evento cancelado en Google Calendar.", RESTORED: "Evento restaurado en Google Calendar." } as const;
    const correlation = randomUUID();
    const { error: timelineError } = await client.from("timeline_events").insert({ project_id: project.id, event_type: `CALENDAR_${result.operation}`, title: messages[result.operation], description: messages[result.operation], orbit_event_id: project.orbit_event_id, actor_id: auth.user.id, actor_label: "Administrador", source: "Calendar", action: `CALENDAR_${result.operation}`, entity_type: "CalendarSync", entity_id: result.record.googleEventId ?? project.id, human_message: messages[result.operation], correlation_id: correlation, created_by: auth.user.id });
    if (timelineError) throw timelineError;
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, operation: result.operation };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible sincronizar Google Calendar." }; }
}
