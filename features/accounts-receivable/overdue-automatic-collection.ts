import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettingsCached } from "@/features/company-settings";
import { resolveCollectionBankDetails } from "./collection-bank-details";
import { buildCollectionEmailDraft, buildCollectionEmailHtml } from "./collection-email.template";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, InMemoryGoogleGmailLiveProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { deliverClaimedD10 } from "./d10-delivery";

type Invoice = { id:string; project_id:string|null; customer_id:string|null; invoice_number:string|null; amount:number|null; paid_amount:number|null; outstanding_balance:number|null; due_date:string|null; status:string|null; effective_status:string|null; deleted_at:string|null; archived_at:string|null; cancelled_at:string|null };
type Row = Record<string, any>;
const day = (d:Date) => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const hour = (d:Date) => Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Santiago",hour:"2-digit",hourCycle:"h23"}).format(d));
const weekday = (d:Date) => new Intl.DateTimeFormat("en-US",{timeZone:"America/Santiago",weekday:"short"}).format(d);
const blocked = new Set(["PAID","CANCELLED","CANCELED","ARCHIVED","DELETED","VOID"]);
const first = (v:any) => Array.isArray(v)?v[0]:v;
export async function sendOverdueCollections(reference=new Date(), opts:{dryRun?:boolean}={}) {
  const today=day(reference);
  if(weekday(reference)!=="Wed" || hour(reference)!==13) return {skipped:true,reason:"Outside Chile Wednesday 13:00 window",sent:0,failed:0,pending:0,candidates:0};
  const admin=createAdminClient();
  const {data:raw,error}=await admin.from("accounts_receivable_projection").select("id,project_id,customer_id,invoice_number,amount,paid_amount,outstanding_balance,due_date,status,effective_status,deleted_at,archived_at,cancelled_at").lt("due_date",today).gt("outstanding_balance",0);
  if(error) throw error;
  const eligible=(raw??[] as Invoice[]).filter((i:Invoice)=>i.project_id && i.customer_id && i.due_date && !i.deleted_at && !i.archived_at && !i.cancelled_at && !blocked.has(String(i.effective_status??i.status??"").toUpperCase()) && Number.isFinite(Number(i.outstanding_balance)) && Number(i.outstanding_balance)>0);
  const ids=[...new Set(eligible.map((i:Invoice)=>i.project_id!))];
  if(!ids.length) return {sent:0,failed:0,pending:0,candidates:0};
  const {data:projects,error:projectError}=await admin.from("projects").select("id,customer_id,name,status,event_date,location,city,customers(full_name,email,secondary_email)").in("id",ids).is("deleted_at",null);
  if(projectError) throw projectError;
  const projectMap=new Map((projects??[]).map((p:Row)=>[p.id,p]));
  const grouped=new Map<string,Invoice[]>();
  for(const invoice of eligible as Invoice[]) {
    const project=projectMap.get(invoice.project_id!);
    if(!project || !project.event_date || String(project.event_date).slice(0,10)>=today || blocked.has(String(project.status??"").toUpperCase()) || project.customer_id!==invoice.customer_id) continue;
    const key=invoice.customer_id+":"+invoice.project_id;
    grouped.set(key,[...(grouped.get(key)??[]),invoice]);
  }
  let sent=0,failed=0,pending=0,skipped=0;
  for(const invoices of grouped.values()) {
    const project=projectMap.get(invoices[0].project_id!)!;
    const customer=first(project.customers);
    const recipient=String(customer?.email??"").trim();
    const balance=invoices.reduce((s,i)=>s+Number(i.outstanding_balance),0);
    if(!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !Number.isFinite(balance) || balance<=0){skipped++;continue;}
    const key="automatic-collection-overdue:"+project.id+":"+today;
    const {data:existing,error:existingError}=await admin.from("communications").select("id,status").eq("project_id",project.id).eq("request_key",key).maybeSingle();
    if(existingError) throw existingError;
    if(existing){skipped++;continue;}
    // Do not send a second collection on a day already handled by D-10.
    const {data:d10,error:d10Error}=await admin.from("communications").select("id").eq("project_id",project.id).eq("communication_type","COLLECTION_D10").gte("occurred_at",today+"T00:00:00-03:00").limit(1);
    if(d10Error) throw d10Error;
    if(d10?.length){skipped++;continue;}
    if(opts.dryRun){skipped++;continue;}
    const dueDate=[...invoices].sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))[0].due_date!;
    const draft=buildCollectionEmailDraft({
      invoiceNumber:invoices.map(i=>i.invoice_number).filter(Boolean).join(", ")||"Pendiente",
      customerName:String(customer.full_name??"Cliente"),customerEmail:recipient,customerSecondaryEmail:customer.secondary_email??null,
      projectName:String(project.name??"BOOMBOX"),amount:invoices.reduce((s,i)=>s+Number(i.amount??0),0),
      outstandingBalance:balance,dueDate,eventDate:project.event_date??undefined,eventLocation:project.location??undefined,
      service:undefined,eventDuration:undefined,daysRemaining:-1,status:"OVERDUE",collectionActions:[],
    },resolveCollectionBankDetails(await loadCompanySettingsCached()));
    // Re-read canonical balances immediately before claiming an email; never charge a paid invoice.
    const {data:latest,error:latestError}=await admin.from("accounts_receivable_projection").select("id,outstanding_balance,due_date,effective_status,status,deleted_at,archived_at,cancelled_at").in("id",invoices.map(i=>i.id));
    if(latestError) throw latestError;
    const latestRows=(latest??[]) as Array<{id:string;outstanding_balance:number|null;due_date:string|null;effective_status:string|null;status:string|null;deleted_at:string|null;archived_at:string|null;cancelled_at:string|null}>;
    if(latestRows.length!==invoices.length || latestRows.some(i=>!i.due_date || i.due_date>=today || Number(i.outstanding_balance)<=0 || !Number.isFinite(Number(i.outstanding_balance)) || i.deleted_at || i.archived_at || i.cancelled_at || blocked.has(String(i.effective_status??i.status??"").toUpperCase()))){skipped++;continue;}
    // Never collect before or on the event date, even when an invoice due date has passed.
    const {data:currentProject,error:currentProjectError}=await admin.from("projects").select("event_date,status,deleted_at").eq("id",project.id).maybeSingle();
    if(currentProjectError) throw currentProjectError;
    if(!currentProject || currentProject.deleted_at || !currentProject.event_date || String(currentProject.event_date).slice(0,10)>=today || blocked.has(String(currentProject.status??"").toUpperCase())){skipped++;continue;}
    const refreshedBalance=latestRows.reduce((sum,i)=>sum+Number(i.outstanding_balance),0);
    if(refreshedBalance!==balance){skipped++;continue;}
    const payload={customer_id:invoices[0].customer_id,project_id:project.id,channel:"GMAIL",direction:"OUTBOUND",communication_type:"COLLECTION_OVERDUE_AUTOMATIC",request_key:key,thread_key:key,subject:draft.subject,body:draft.body,status:"PENDING",to_recipient:recipient,cc_recipients:[],occurred_at:new Date().toISOString(),sent_at:null,external_message_id:null,failure_reason:null,context_snapshot:{automatic:true,trigger:"OVERDUE_WED_13",sendMode:"AUTOMATIC",date:today,outstandingBalance:balance,invoiceIds:invoices.map(i=>i.id),recipient}};
    const {data:claim,error:claimError}=await admin.from("communications").insert(payload).select("id").maybeSingle();
    if(claimError?.code==="23505"){skipped++;continue;}
    if(claimError) throw claimError;
    if(!claim?.id){skipped++;continue;}
    const notify=async(status:"SENT"|"FAILED"|"PENDING",details?:string)=>{
      const {error:notificationError}=await admin.from("internal_notifications").upsert({
        project_id:project.id,customer_id:invoices[0].customer_id,
        notification_type:"COLLECTION_OVERDUE_AUTOMATIC",
        category:"PAYMENTS",priority:status==="SENT"?"NORMAL":"HIGH",
        title:status==="SENT"?"Cobranza automática enviada":status==="PENDING"?"Cobranza pendiente de verificación":"Cobranza automática fallida",
        message:`${project.name??"Evento"} · ${recipient} · Saldo ${balance.toLocaleString("es-CL")} · ${status}`,
        correlation_id:key,entity_type:"project",entity_id:project.id,
        related_href:`/admin/events/${project.id}`,
        metadata:{communicationId:claim.id,requestKey:key,recipient,bcc:"matias.maira.larrain@gmail.com",balance,status,details:details??null}
      },{onConflict:"correlation_id"});
      if(notificationError) console.error("overdue_collection.notification_failed",{communicationId:claim.id,error:notificationError.message});
    };
    const result=await deliverClaimedD10({
      claim:async()=>true,
      sendOnce:async()=>{
        const msg={to:recipient,cc:[],bcc:["matias.maira.larrain@gmail.com"],subject:draft.subject,textBody:draft.body,htmlBody:buildCollectionEmailHtml(draft),driveFileIds:[],idempotencyKey:key,maxSendAttempts:1};
        if(process.env.VERCEL_ENV==="preview" && process.env.D10_QA_EMAIL_MOCK==="true") return new InMemoryGoogleGmailLiveProvider().send({...msg,bcc:[],from:'"BOOMBOX QA" <qa@synthetic.invalid>'});
        if(process.env.VERCEL_ENV==="preview") throw new Error("Preview email sending blocked: enable D10_QA_EMAIL_MOCK for synthetic QA");
        const workspace=await loadGoogleWorkspaceConnection();
        if(!workspace.workspaceAccount?.trim()) throw new Error("Google Workspace sender unavailable");
        return new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({...msg,from:'"BOOMBOX Cabinas Fotográficas" <'+workspace.workspaceAccount.trim()+'>'});
      },
      markSent:async(r)=>{const {error:e}=await admin.from("communications").update({status:"SENT",external_message_id:r.messageId,sent_at:new Date().toISOString(),failure_reason:null}).eq("id",claim.id);if(e)throw e;await notify("SENT");},
      markPending:async(e)=>{await admin.from("communications").update({status:"PENDING",failure_reason:String(e).slice(0,500)}).eq("id",claim.id);await notify("PENDING",String(e).slice(0,500));},
      markFailed:async(e)=>{await admin.from("communications").update({status:"FAILED",failure_reason:String(e).slice(0,500)}).eq("id",claim.id);await notify("FAILED",String(e).slice(0,500));}
    });
    if(result==="SENT")sent++;else if(result==="FAILED")failed++;else if(result==="PENDING")pending++;else skipped++;
  }
  return {sent,failed,pending,skipped,candidates:grouped.size,date:today};
}
