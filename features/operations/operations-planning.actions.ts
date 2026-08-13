"use server";

import {revalidatePath} from "next/cache";
import {createSupabaseServerActionClient} from "@/lib/supabase/server";
import {deliverSmartAssignmentPackage} from "./smart-assignment-package.service";

type Result={ok:true;message:string}|{ok:false;message:string};
async function context(){const client=await createSupabaseServerActionClient();const{data,error}=await client.auth.getUser();if(error||!data.user)throw new Error("Sesión requerida.");const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",data.user.id).single();if(profileError||!["CEO","ADMINISTRATOR"].includes(profile?.role))throw new Error("Solo Administración puede asignar Staff.");return client;}
const value=(data:FormData,key:string)=>String(data.get(key)??"").trim();

type ApprovalStage="SERVER_ACTION"|"AUTHENTICATION"|"REQUEST_LOOKUP"|"RPC"|"PACKAGE_DELIVERY"|"REVALIDATION";
type ApprovalRequest={id:string;project_id:string;staff_id:string;responsibility:string;status:string};
const approvalError=(error:unknown)=>{const record=error&&typeof error==="object"?error as Record<string,unknown>:{};const message=error instanceof Error?error.message:typeof record.message==="string"?record.message:String(error);return{message,code:typeof record.code==="string"?record.code:null,details:typeof record.details==="string"?record.details:null,hint:typeof record.hint==="string"?record.hint:null,stack:error instanceof Error?error.stack:new Error(message).stack};};

export async function assignEventResponsibilityAction(data:FormData):Promise<Result>{try{const client=await context();const{error}=await client.rpc("assign_event_operational_responsibility",{p_project_id:value(data,"projectId"),p_staff_id:value(data,"staffId"),p_responsibility:value(data,"responsibility"),p_reason:"Asignación desde Centro de Operaciones"});if(error)throw error;revalidatePath("/operations");revalidatePath(`/projects/${value(data,"projectId")}`);return{ok:true,message:"Asignación guardada."};}catch(error){return{ok:false,message:error instanceof Error?error.message:"No fue posible guardar la asignación."};}}

export async function adjustEventRolePayAction(data:FormData):Promise<Result>{try{const client=await context();const paymentId=value(data,"paymentId"),role=value(data,"role"),amount=Number(data.get("amount")),reason=value(data,"reason");if(!paymentId||!Number.isFinite(amount)||amount<0||!reason)throw new Error("Ingresa un neto válido y el motivo del ajuste.");const{data:payment,error:readError}=await client.from("event_staff_payments").select("project_id,automatic_operator_payment,automatic_assembly_payment,automatic_disassembly_payment,operator_payment,assembly_payment,disassembly_payment").eq("id",paymentId).is("deleted_at",null).single();if(readError)throw readError;const original=role==="OPERATOR"?Number(payment.automatic_operator_payment||payment.operator_payment):role==="ASSEMBLY"?Number(payment.automatic_assembly_payment||payment.assembly_payment):Number(payment.automatic_disassembly_payment||payment.disassembly_payment),difference=amount-original;if(difference===0)throw new Error("El valor ingresado es igual al original; no requiere ajuste.");const{error}=await client.rpc("add_staff_settlement_adjustment",{p_settlement_id:paymentId,p_reason:"DIFFERENCE_CORRECTION",p_amount:difference,p_comment:reason});if(error)throw error;revalidatePath("/operations");revalidatePath(`/projects/${payment.project_id}`);revalidatePath("/resources/staff");revalidatePath("/finance");revalidatePath("/reports");return{ok:true,message:"Ajuste registrado sin alterar la liquidación original."};}catch(error){return{ok:false,message:error instanceof Error?error.message:"No fue posible ajustar el pago."};}}

export async function setStaffEventPublicationAction(data:FormData):Promise<Result>{try{const client=await context(),projectId=value(data,"projectId"),published=value(data,"published")==="true";const{data:project,error:projectError}=await client.from("projects").select("status,event_date,location,city,operations,customers(full_name),project_services(service_code,duration_hours)").eq("id",projectId).is("deleted_at",null).single();if(projectError)throw projectError;const closed=["COMPLETED","COMPLETED_EVENT","CLOSED","ARCHIVED","CANCELLED","Completed","Archived","Cancelled"].includes(project.status);if(published&&closed)throw new Error("Un Evento cerrado no puede recibir nuevas solicitudes de Staff.");const customer=Array.isArray(project.customers)?project.customers[0]:project.customers,services=Array.isArray(project.project_services)?project.project_services:[],operations=(project.operations??{})as Record<string,unknown>,address=String(operations.eventAddress??project.location??"");if(published&&(!project.event_date||!address||!project.city||!customer?.full_name||!services.some(item=>item.service_code&&Number(item.duration_hours)>0)))throw new Error("Completa fecha, ubicación, cliente, servicio y duración antes de activar el Evento para Staff.");const{error}=await client.rpc("set_staff_event_publication",{p_project_id:projectId,p_published:published});if(error)throw error;revalidatePath("/operations");revalidatePath("/resources/staff");revalidatePath(`/projects/${projectId}`);revalidatePath("/staff-portal");return{ok:true,message:published?"Evento activado y visible en Portal Staff.":"Evento desactivado. Las asignaciones confirmadas permanecen intactas."};}catch(error){return{ok:false,message:error instanceof Error?error.message:"No fue posible cambiar la publicación."};}}

export async function reviewStaffRequestAction(data:FormData):Promise<Result>{
  const reference=crypto.randomUUID().slice(0,8).toUpperCase(),requestId=value(data,"requestId"),decision=value(data,"decision"),approved=decision==="approve";
  let stage:ApprovalStage="SERVER_ACTION",userId:string|null=null,request:ApprovalRequest|null=null;
  console.info("[staff-approval] received",{reference,stage,payload:{requestId,decision}});
  try{
    stage="AUTHENTICATION";
    const client=await createSupabaseServerActionClient();
    const{data:auth,error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!auth.user)throw new Error("Sesión requerida.");
    userId=auth.user.id;
    const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",userId).single();
    if(profileError)throw profileError;
    if(!["CEO","ADMINISTRATOR"].includes(profile?.role))throw new Error("Solo Administración puede asignar Staff.");
    console.info("[staff-approval] authenticated",{reference,stage,userId,role:profile.role});

    stage="REQUEST_LOOKUP";
    const{data:pendingRequest,error:requestError}=await client.from("staff_assignment_requests").select("id,project_id,staff_id,responsibility,status").eq("id",requestId).single();
    if(requestError)throw requestError;
    request=pendingRequest as ApprovalRequest;
    console.info("[staff-approval] request-loaded",{reference,stage,userId,request});

    stage="RPC";
    const payload={p_request_id:requestId,p_approved:approved,p_reason:approved?"Aprobada por Founder":"Rechazada por Founder"};
    console.info("[staff-approval] rpc-start",{reference,stage,userId,request,payload});
    const{data:review,error:rpcError}=await client.rpc("review_staff_assignment_request",payload);
    if(rpcError)throw rpcError;
    if(approved&&(!review||String((review as Record<string,unknown>).status)!=="CONFIRMED"))throw new Error("La aprobación no confirmó la asignación y su liquidación.");
    console.info("[staff-approval] rpc-complete",{reference,stage,userId,request,result:review});

    let deliveryWarning="";
    if(approved){
      stage="PACKAGE_DELIVERY";
      try{await deliverSmartAssignmentPackage(client,requestId);}
      catch(error){const failure=approvalError(error);console.error("[staff-approval] package-failed",{reference,stage,userId,request,error:failure});deliveryWarning=` La asignación y liquidación quedaron confirmadas, pero la entrega del paquete requiere atención: ${failure.message}.`;}
    }
    stage="REVALIDATION";
    revalidatePath("/");revalidatePath("/operations");revalidatePath("/projects","layout");revalidatePath("/resources/staff");revalidatePath("/staff-portal");revalidatePath("/finance");revalidatePath("/finance/cash-flow");revalidatePath("/reports");
    console.info("[staff-approval] completed",{reference,stage,userId,request});
    return{ok:true,message:approved?`Aprobación completada: asignación y liquidación creadas; Portal, email, calendario y checklist preparados.${deliveryWarning}`:"Solicitud rechazada."};
  }catch(error){
    const failure=approvalError(error);
    console.error("[staff-approval] failed",{reference,stage,userId,payload:{requestId,decision},request,error:failure});
    return{ok:false,message:`Aprobación falló en ${stage}. ${failure.message}${failure.code?` [${failure.code}]`:""}. Referencia ${reference}.`};
  }
}
