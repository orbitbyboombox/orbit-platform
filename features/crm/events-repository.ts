import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmOperationalEvent } from "./types";
import {chileDateTime,resolveEventOperationalWindow} from "@/features/operations/event-operational-window";

type EventRow = {
  id: string;
  customer_id: string;
  project_id: string;
  orbit_event_id: string;
  event_type: string;
  event_date: string | null;
  status: string;
  projects: {
    name: string;
    event_time: string | null;
    location: string | null;
    city: string | null;
    deleted_at: string | null;
    project_services: Array<{ service_code: string; duration_hours: number | null }>;
    quotations: Array<{ transport_total: number | null; created_at: string }>;
  } | Array<{
    name: string;
    event_time: string | null;
    location: string | null;
    city: string | null;
    deleted_at: string | null;
    project_services: Array<{ service_code: string; duration_hours: number | null }>;
    quotations: Array<{ transport_total: number | null; created_at: string }>;
  }>;
};

export async function loadCrmOperationalEvents(client: SupabaseClient): Promise<CrmOperationalEvent[]> {
  const { data: rawEvents, error } = await client.from("crm_events").select("id,customer_id,project_id,orbit_event_id,event_type,event_date,status,projects!inner(name,event_time,location,city,deleted_at,project_services(service_code,duration_hours),quotations(transport_total,created_at))").order("event_date", { ascending: true });
  if (error) throw error;
  const events = (rawEvents ?? []) as unknown as EventRow[];
  const active = events.filter((event)=>{const project=Array.isArray(event.projects)?event.projects[0]:event.projects;return project&&!project.deleted_at;});
  const customerIds=[...new Set(active.map(event=>event.customer_id))];
  const projectIds=[...new Set(active.map(event=>event.project_id))];
  const [{data:customers,error:customerError},{data:assignments,error:assignmentError},{data:contracts,error:contractError}]=await Promise.all([
    customerIds.length?client.from("customers").select("id,full_name,company").in("id",customerIds):Promise.resolve({data:[],error:null}),
    projectIds.length?client.from("assignments").select("project_id,assignment_type,status,staff_call_at,staff(first_name,last_name)").in("project_id",projectIds).is("deleted_at",null):Promise.resolve({data:[],error:null}),
    projectIds.length?client.from("project_operational_contracts").select("project_id,staff_arrival_at,service_start_at,service_end_at").in("project_id",projectIds):Promise.resolve({data:[],error:null}),
  ]);
  if(customerError)throw customerError;if(assignmentError)throw assignmentError;if(contractError)throw contractError;
  const customerMap=new Map((customers??[]).map(customer=>[customer.id,customer]));
  const operatorMap=new Map<string,string>();
  for(const assignment of assignments??[]){if(!String(assignment.assignment_type).toUpperCase().includes("OPERATOR"))continue;const staff=Array.isArray(assignment.staff)?assignment.staff[0]:assignment.staff;if(staff)operatorMap.set(assignment.project_id,`${staff.first_name??""} ${staff.last_name??""}`.trim());}
  const contractMap=new Map((contracts??[]).map(contract=>[contract.project_id,contract]));
  const unique=new Map<string,CrmOperationalEvent>();
  for(const event of active){if(unique.has(event.project_id))continue;const project=Array.isArray(event.projects)?event.projects[0]:event.projects;if(!project||!event.event_date)continue;const service=project.project_services?.[0];const quotation=[...(project.quotations??[])].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];const customer=customerMap.get(event.customer_id),contract=contractMap.get(event.project_id);const legacyStart=`${event.event_date}T${project.event_time?.slice(0,5)??"00:00"}:00-04:00`,legacyEnd=new Date(new Date(legacyStart).getTime()+Number(service?.duration_hours??0)*3600000).toISOString();const window=resolveEventOperationalWindow({assignmentStaffCalls:(assignments??[]).filter(item=>item.project_id===event.project_id&&!['REJECTED','CANCELLED'].includes(String(item.status))).map(item=>item.staff_call_at),staffArrivalAt:contract?.staff_arrival_at,serviceStartAt:contract?.service_start_at??legacyStart,serviceEndAt:contract?.service_end_at??legacyEnd});const serviceStart=chileDateTime(window.serviceStartAt),serviceEnd=chileDateTime(window.serviceEndAt),staffCall=window.source==='SERVICE_START'?null:chileDateTime(window.operationalStartAt);unique.set(event.project_id,{id:event.id,projectId:event.project_id,orbitEventId:event.orbit_event_id,type:event.event_type,date:event.event_date,time:serviceStart.time,status:event.status,name:project.name,location:project.location,municipality:project.city,service:service?.service_code??"",duration:service?.duration_hours??null,transport:Number(quotation?.transport_total??0),customerId:event.customer_id,customerName:customer?.full_name??"Cliente sin nombre",company:customer?.company??"",operator:operatorMap.get(event.project_id)??"Sin asignar",serviceStartAt:`${serviceStart.date}T${serviceStart.time}`,serviceEndAt:`${serviceEnd.date}T${serviceEnd.time}`,staffCallAt:staffCall?`${staffCall.date}T${staffCall.time}`:null});}
  return [...unique.values()];
}
