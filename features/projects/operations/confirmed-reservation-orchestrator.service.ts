import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import {
  deliverConfirmedReservationEmail,
  deliverFounderReservationNotification,
} from "@/features/connectors/google-gmail/application/google-gmail-delivery.service";
import {
  runConfirmedReservationOperationalPipeline,
  type OperationalPipelineStage,
} from "./confirmed-reservation-pipeline.service";

export type ConfirmationStage =
  | "RECORDS"
  | "TIMELINE"
  | OperationalPipelineStage
  | "PORTAL"
  | "CUSTOMER_EMAIL"
  | "FOUNDER_EMAIL"
  | "DASHBOARD";

export async function confirmPersistedReservation(input: {
  client: SupabaseClient;
  projectId: string;
  actorId: string;
  sendCustomerCommunication?: boolean;
  portal?: { url: string; expiresAt: string };
  completedStages?: ReadonlySet<ConfirmationStage>;
  onStage?: (
    stage: ConfirmationStage,
    status: "STARTED" | "PASS" | "FAIL",
  ) => void | Promise<void>;
}) {
  const done = input.completedStages ?? new Set<ConfirmationStage>();
  let portal = input.portal;
  const warnings:Array<{stage:ConfirmationStage;error:string}>=[];
  const boundary=async<T>(stage:ConfirmationStage,operation:()=>Promise<T>)=>{if(done.has(stage))return undefined;await input.onStage?.(stage,"STARTED");try{const value=await operation();await input.onStage?.(stage,"PASS");return value;}catch(error){await input.onStage?.(stage,"FAIL");const message=error instanceof Error?error.message:String(error);warnings.push({stage,error:message});console.error(JSON.stringify({level:"error",event:"reservation.boundary_b.failed",projectId:input.projectId,stage,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error),timestamp:new Date().toISOString()}));await input.client.from("internal_notifications").upsert({project_id:input.projectId,notification_type:"RESERVATION_BOUNDARY_FAILURE",title:`Reserva confirmada · ${stage} pendiente`,message:"La reserva quedó confirmada. ORBIT debe reintentar una integración secundaria.",status:"UNREAD",correlation_id:`reservation-boundary-failure:${input.projectId}:${stage}`,category:"SYSTEM",priority:"HIGH",action_required:true,entity_type:"Project",entity_id:input.projectId,related_href:`/projects/${input.projectId}`,metadata:{stage,error:message}},{onConflict:"correlation_id"});return undefined;}};

  if (!done.has("RECORDS")) {
    await input.onStage?.("RECORDS", "STARTED");
    const { error } = await input.client.rpc(
      "prepare_confirmed_reservation_records",
      { p_project_id: input.projectId, p_actor_id: input.actorId },
    );
    if (error) throw error;
    await input.onStage?.("RECORDS", "PASS");
  }

  await boundary("TIMELINE",async()=>{const{data:project,error:projectError}=await input.client.from("projects").select("customer_id,orbit_event_id").eq("id",input.projectId).single();if(projectError)throw projectError;const{data:event,error:eventError}=await input.client.from("crm_events").select("id").eq("project_id",input.projectId).single();if(eventError)throw eventError;const{error}=await input.client.from("timeline_events").upsert({customer_id:project.customer_id,project_id:input.projectId,crm_event_id:event.id,orbit_event_id:project.orbit_event_id,event_type:"UNIFIED_RESERVATION_PREPARED",title:"Reserva preparada por pipeline único",description:"CRM, evento, propuesta y cobranza confirmados.",actor_id:input.actorId,actor_label:"ORBIT",source:"System",action:"UNIFIED_RESERVATION_PREPARED",entity_type:"Project",entity_id:input.projectId,human_message:"Registros de reserva unificados.",correlation_id:`unified-reservation-records:${input.projectId}`,new_state:"CONFIRMED",created_by:input.actorId},{onConflict:"correlation_id",ignoreDuplicates:true});if(error)throw error;});

  const createdPortal=await boundary("PORTAL",()=>createCustomerPortalAccess(input.projectId,input.actorId));
  portal??=createdPortal;

  const operational=await runConfirmedReservationOperationalPipeline({
    client: input.client,
    projectId: input.projectId,
    actorId: input.actorId,
    completedStages: new Set(
      (["BUSINESS_ENGINE", "GOOGLE_CALENDAR", "GOOGLE_DRIVE"] as const).filter(
        (stage) => done.has(stage),
      ),
    ),
    onStage: input.onStage,
    continueOnError:true,
  });
  warnings.push(...operational.failures);

  if(input.sendCustomerCommunication)await boundary("CUSTOMER_EMAIL",async()=>{
    const delivery = await deliverConfirmedReservationEmail({
      projectId: input.projectId,
      actorId: input.actorId,
      portal,
    });
    if (delivery.status !== "SENT")
      throw new Error("El documento oficial aún no está listo para enviar.");
  });

  await boundary("FOUNDER_EMAIL",async()=>{
    const founder = await deliverFounderReservationNotification({
      projectId: input.projectId,
      actorId: input.actorId,
    });
    if (founder.status === "FAILED")
      throw new Error("La notificación del Founder no pudo ser entregada.");
  });

  await boundary("DASHBOARD",async()=>{
    const { data: project, error: projectError } = await input.client
      .from("projects")
      .select("customer_id,orbit_event_id,name,project_services(service_code)")
      .eq("id", input.projectId)
      .single();
    if (projectError) throw projectError;
    const { error } = await input.client.from("internal_notifications").upsert(
      {
        project_id: input.projectId,
        customer_id: project.customer_id,
        notification_type: "RESERVATION_CONFIRMED",
        title: "🎉 Nueva Reserva Confirmada",
        message: `${project.name} · ${(project.project_services ?? []).map((service) => service.service_code).join(" + ")}`,
        status: "UNREAD",
        correlation_id: `reservation-confirmed:${input.projectId}`,
        category: "COMMERCIAL",
        priority: "HIGH",
        action_required: false,
        entity_type: "Project",
        entity_id: input.projectId,
        related_href: `/projects/${input.projectId}`,
      },
      { onConflict: "correlation_id" },
    );
    if (error) throw error;
  });

  return { portal, warnings };
}
