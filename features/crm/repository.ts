import type {SupabaseClient} from "@supabase/supabase-js";
import type {CrmCustomerProfile,CrmCustomerSummary,CrmEventSummary} from "./types";

type CustomerRow={id:string;full_name:string;rut:string|null;company:string|null;phone:string|null;email:string|null;address:string|null;city:string|null;metadata:Record<string,unknown>|null;version:number;updated_at:string};
const text=(value:string|null)=>value??"";

export async function loadCrmCustomers(client:SupabaseClient):Promise<CrmCustomerSummary[]>{
  const[{data:customers,error},{data:events,error:eventError}]=await Promise.all([
    client.from("customers").select("id,full_name,rut,company,phone,email,address,city,metadata,version,updated_at").is("deleted_at",null).order("updated_at",{ascending:false}),
    client.from("crm_events").select("customer_id,event_date,status").not("status","in","(CANCELLED,ARCHIVED)").order("event_date",{ascending:true}),
  ]);if(error)throw error;if(eventError)throw eventError;
  const grouped=new Map<string,Array<{event_date:string|null;status:string}>>();for(const event of events??[]){const list=grouped.get(event.customer_id)??[];list.push(event);grouped.set(event.customer_id,list)}
  return((customers??[])as CustomerRow[]).map(row=>{const owned=grouped.get(row.id)??[];return{id:row.id,fullName:row.full_name,rut:text(row.rut),company:text(row.company),phone:text(row.phone),email:text(row.email),address:text(row.address),city:text(row.city),version:row.version,eventCount:owned.length,nextEvent:owned.find(item=>item.event_date&&item.event_date>=new Date().toISOString().slice(0,10))?.event_date??undefined,updatedAt:row.updated_at}});
}

export async function loadCrmCustomerProfile(client:SupabaseClient,customerId:string):Promise<CrmCustomerProfile|null>{
  const[{data:customer,error},{data:events,error:eventError},{data:payments,error:paymentError},{data:invoices,error:invoiceError},{data:timeline,error:timelineError},{data:negotiations,error:negotiationError}]=await Promise.all([
    client.from("customers").select("id,full_name,rut,company,phone,email,address,city,metadata,version,updated_at").eq("id",customerId).is("deleted_at",null).maybeSingle(),
    client.from("crm_events").select("id,project_id,orbit_event_id,event_type,event_date,status,projects(name,location,city)").eq("customer_id",customerId).order("event_date",{ascending:false}),
    client.from("invoice_payments").select("id,invoices!inner(customer_id)").eq("invoices.customer_id",customerId),client.from("invoices").select("id",{count:"exact"}).eq("customer_id",customerId),
    client.from("crm_customer_timeline").select("id,title,human_message,occurred_at").eq("customer_id",customerId).order("occurred_at",{ascending:false}).limit(50),
    client.from("reservation_commercial_negotiations").select("id,project_id,orbit_event_id,official_total,negotiated_total,difference,difference_percentage,reason,created_at,profiles!created_by(display_name)").eq("customer_id",customerId).order("created_at",{ascending:false}),
  ]);const firstError=error??eventError??paymentError??invoiceError??timelineError??negotiationError;if(firstError)throw firstError;if(!customer)return null;
  const row=customer as CustomerRow;const eventRows=(events??[])as unknown as Array<{id:string;project_id:string;orbit_event_id:string;event_type:string;event_date:string|null;status:string;projects:{name:string;location:string|null;city:string|null}|Array<{name:string;location:string|null;city:string|null}>}>;
  const mapped:CrmEventSummary[]=eventRows.map(item=>{const project=Array.isArray(item.projects)?item.projects[0]:item.projects;return{id:item.id,projectId:item.project_id,orbitEventId:item.orbit_event_id,type:item.event_type,date:item.event_date,status:item.status,name:project?.name??"Evento BOOMBOX",location:project?.location??null,municipality:project?.city??null}});
  const projectIds=mapped.map(item=>item.projectId);const[{data:agreements,error:agreementError},{data:portals,error:portalError}]=projectIds.length?await Promise.all([client.from("agreements").select("id").in("project_id",projectIds),client.from("customer_portal_tokens").select("id").in("project_id",projectIds).is("revoked_at",null)]):[{data:[],error:null},{data:[],error:null}];if(agreementError??portalError)throw agreementError??portalError;
  const negotiationRows=(negotiations??[])as unknown as Array<{id:string;project_id:string;orbit_event_id:string;official_total:number;negotiated_total:number;difference:number;difference_percentage:number;reason:string;created_at:string;profiles:{display_name:string}|Array<{display_name:string}>}>;
  const metadata=row.metadata??{};return{id:row.id,fullName:row.full_name,rut:text(row.rut),company:text(row.company),phone:text(row.phone),email:text(row.email),address:text(row.address),city:text(row.city),version:row.version,eventCount:mapped.length,nextEvent:mapped.find(item=>item.date&&item.date>=new Date().toISOString().slice(0,10))?.date??undefined,updatedAt:row.updated_at,commercialNotes:typeof metadata.commercialNotes==="string"?metadata.commercialNotes:"",events:mapped,contracts:agreements?.length??0,payments:payments?.length??0,invoices:invoices?.length??0,portalActive:(portals?.length??0)>0,timeline:(timeline??[]).map(item=>({id:item.id,title:item.title,message:item.human_message,date:item.occurred_at})),negotiations:negotiationRows.map(item=>{const profile=Array.isArray(item.profiles)?item.profiles[0]:item.profiles;return{id:item.id,projectId:item.project_id,orbitEventId:item.orbit_event_id,officialPrice:Number(item.official_total),negotiatedPrice:Number(item.negotiated_total),difference:Number(item.difference),differencePercentage:Number(item.difference_percentage),reason:item.reason,user:profile?.display_name??"Usuario ORBIT",timestamp:item.created_at}})};
}
