import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {loadPortalSession} from "@/features/portal-authentication/portal-auth.service";
import {chileDateTime} from "@/features/operations/event-operational-window";
import {getCanonicalOrbitEventState} from "@/features/operations/canonical-event-state";

const escapeIcs=(value:unknown)=>String(value??"").replaceAll("\\","\\\\").replaceAll(";","\\;").replaceAll(",","\\,").replaceAll("\n","\\n");
const compact=(date:string,time:string)=>`${date.replaceAll("-","")}T${time.slice(0,5).replace(":","")}00`;

export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return NextResponse.json({error:"Sesión requerida."},{status:401});
  const{projectId}=await params,admin=createAdminClient();const{count}=await admin.from("assignments").select("id",{count:"exact",head:true}).eq("project_id",projectId).eq("staff_id",session.staff_id).is("deleted_at",null).not("status","in",'(CANCELLED,REJECTED)');if(!count)return NextResponse.json({error:"Evento no asignado."},{status:403});
  const{data:project,error}=await admin.from("projects").select("id,name,orbit_event_id,event_date,event_time,location,city,operations,customers(full_name,phone),project_services(service_code,duration_hours)").eq("id",projectId).single();if(error||!project)return NextResponse.json({error:"Evento no encontrado."},{status:404});
  const canonical=await getCanonicalOrbitEventState(admin,projectId);if(!canonical)return NextResponse.json({error:"Horario operacional no disponible."},{status:404});const customer=Array.isArray(project.customers)?project.customers[0]:project.customers,services=Array.isArray(project.project_services)?project.project_services:[],ops=(project.operations??{})as Record<string,unknown>,start=chileDateTime(canonical.serviceStartAt),end=chileDateTime(canonical.serviceEndAt),address=String(ops.eventAddress??project.location??"");
  const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//BOOMBOX//ORBIT Staff//ES","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:${project.id}@orbit.boom-box.cl`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`,`DTSTART;TZID=America/Santiago:${compact(start.date,start.time)}`,`DTEND;TZID=America/Santiago:${compact(end.date,end.time)}`,`SUMMARY:${escapeIcs(`BOOMBOX · ${customer?.full_name??project.name}`)}`,`LOCATION:${escapeIcs(`${address}, ${project.city??""}`)}`,`DESCRIPTION:${escapeIcs(`Servicio: ${services.map(item=>item.service_code).filter(Boolean).join(" + ")}\nCliente: ${customer?.full_name??project.name}\nTeléfono: ${customer?.phone??"Por confirmar"}\nProducción: ${String(ops.productionContact??"BOOMBOX")} ${String(ops.productionPhone??"")}\nORBIT Event ID: ${project.orbit_event_id}\nNotas: ${String(ops.staffNotes??ops.operationalNotes??"")}`)}`,"END:VEVENT","END:VCALENDAR",""].join("\r\n");
  return new NextResponse(body,{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":`attachment; filename="BOOMBOX-${project.orbit_event_id}.ics"`}});
}
