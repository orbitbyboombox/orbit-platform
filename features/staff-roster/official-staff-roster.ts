import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatChileanRut, isValidChileanRut } from "@/lib/chile/rut";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";

export const OFFICIAL_ROSTER_RESPONSIBLE = { name: "Matías Maira", rut: "16.357.402-0", phone: "+56 9 7306 9315" } as const;
export type RosterMember = { assignmentId: string; staffId: string; name: string; rut: string; role: string; roleLabel: string; block: string; status: string };
export type RosterComposer = { projectId: string; orbitEventId: string; eventName: string; eventDate: string; eventTime: string; location: string; city: string; customerName: string; recipient: string; fingerprint: string; members: RosterMember[]; missing: string[]; canGenerate: boolean };

const roleNames: Record<string,string> = { OPERATOR: "Operador", SUPERVISOR: "Supervisor", ASSEMBLY: "Montaje", DISASSEMBLY: "Desmontaje" };
const blockValue = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 50) : "";
export function rosterDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]), 12)));
}
const safeFilename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "evento";
const plain = (value: string) => value.replace(/[\u0000-\u001f]/g, " ").trim();

export async function loadOfficialRoster(projectId: string): Promise<RosterComposer> {
  const admin = createAdminClient();
  const [p, a] = await Promise.all([
    admin.from("projects").select("id,orbit_event_id,name,event_date,event_time,location,city,customer_id,customers!inner(full_name,email,secondary_email),project_operational_contracts(contact_email)").eq("id", projectId).is("deleted_at", null).single(),
    admin.from("assignments").select("id,staff_id,assignment_type,status,resources,staff!inner(first_name,last_name,rut)").eq("project_id", projectId).is("deleted_at", null),
  ]);
  if (p.error) throw p.error;
  if (a.error) throw a.error;
  const customer = Array.isArray(p.data.customers) ? p.data.customers[0] : p.data.customers;
  const contract = Array.isArray(p.data.project_operational_contracts) ? p.data.project_operational_contracts[0] : p.data.project_operational_contracts;
  const members = ((a.data ?? []) as unknown as Array<{id:string;staff_id:string;assignment_type:string;status:string;resources:Record<string,unknown>|null;staff:{first_name:string;last_name:string;rut:string|null}|Array<{first_name:string;last_name:string;rut:string|null}>}>)
    .filter(x => !["CANCELLED","REJECTED","DELETED"].includes(String(x.status).toUpperCase()))
    .map(x => { const s = Array.isArray(x.staff) ? x.staff[0] : x.staff; return { assignmentId:x.id, staffId:x.staff_id, name:[s?.first_name,s?.last_name].filter(Boolean).join(" "), rut:s?.rut ?? "", role:x.assignment_type, roleLabel:roleNames[x.assignment_type] ?? x.assignment_type, block:blockValue(x.resources?.officialRosterBlock), status:x.status }; })
    .sort((x,y) => x.block.localeCompare(y.block,"es") || x.roleLabel.localeCompare(y.roleLabel,"es") || x.name.localeCompare(y.name,"es"));
  const missing:string[] = [];
  if (!members.length) missing.push("No hay integrantes asignados.");
  for (const m of members) { if (!m.block) missing.push("Asigna un bloque a " + (m.name || "un integrante") + "."); if (!isValidChileanRut(m.rut)) missing.push("Revisa el RUT de " + (m.name || "un integrante") + "."); }
  const name = p.data.name || p.data.orbit_event_id || "Evento BOOMBOX";
  const fingerprint = createHash("sha256").update(JSON.stringify({event:p.data.orbit_event_id,name,date:p.data.event_date,members:members.map(({assignmentId,staffId,rut,role,block,status})=>({assignmentId,staffId,rut,role,block,status}))})).digest("hex");
  return { projectId, orbitEventId:p.data.orbit_event_id ?? "", eventName:name, eventDate:p.data.event_date ?? "", eventTime:p.data.event_time ?? "", location:p.data.location ?? "", city:p.data.city ?? "", customerName:customer?.full_name ?? "", recipient:contract?.contact_email ?? customer?.email ?? "", fingerprint, members, missing, canGenerate:missing.length===0 };
}

export async function saveOfficialRosterBlock(input:{projectId:string;assignmentId:string;block:string;actorId:string}) {
  const block=blockValue(input.block);
  if(!block)throw new Error("Escribe un nombre de bloque.");
  const admin=createAdminClient();
  const {data:assignment,error:readError}=await admin.from("assignments").select("id,resources").eq("id",input.assignmentId).eq("project_id",input.projectId).is("deleted_at",null).single();
  if(readError)throw readError;
  const resources=assignment.resources&&typeof assignment.resources==="object"&&!Array.isArray(assignment.resources)?assignment.resources as Record<string,unknown>:{};
  const {data:updated,error:updateError}=await admin.from("assignments").update({resources:{...resources,officialRosterBlock:block}}).eq("id",input.assignmentId).eq("project_id",input.projectId).is("deleted_at",null).select("id").single();
  if(updateError)throw updateError;
  if(!updated)throw new Error("No se pudo guardar el bloque de esta asignación.");
}

export async function makeOfficialRosterPdf(composer:RosterComposer) {
  if (!composer.canGenerate) throw new Error(composer.missing.join(" "));
  const pdf=await PDFDocument.create(), regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.11,.12,.14), muted=rgb(.42,.44,.47), line=rgb(.87,.88,.89), orange=rgb(.96,.43,.05), pale=rgb(.97,.97,.97);
  const width=595.28, height=841.89, left=43, right=552;
  let page=pdf.addPage([width,height]), y=0;
  const truncate=(value:string,maxWidth:number,font:typeof regular,fontSize:number)=>{
    let result=plain(value);
    while(result && font.widthOfTextAtSize(result,fontSize)>maxWidth)result=result.slice(0,-1);
    return result===plain(value)?result:result.slice(0,-1)+"…";
  };
  const header=()=>{
    page.drawText("BOOMBOX",{x:left,y:height-61,size:25,font:bold,color:ink});
    page.drawText("®",{x:183,y:height-51,size:10,font:regular,color:ink});
    page.drawText("NÓMINA OFICIAL",{x:left,y:height-91,size:11,font:bold,color:orange});
    page.drawText(truncate(composer.orbitEventId||"",190,regular,9),{x:362,y:height-88,size:9,font:regular,color:muted});
    page.drawLine({start:{x:left,y:height-105},end:{x:right,y:height-105},thickness:1,color:line});
    y=height-132;
  };
  const next=()=>{page=pdf.addPage([width,height]);header();};
  const ensure=(space:number)=>{if(y-space<65)next();};
  header();
  const details:[string,string][]=[["EVENTO",composer.eventName],["FECHA",rosterDate(composer.eventDate)],["HORARIO",composer.eventTime||"Por confirmar"],["LUGAR",[composer.location,composer.city].filter(Boolean).join(" · ")||"Por confirmar"]];
  for(const [label,value] of details){
    page.drawText(label,{x:left,y,size:8,font:bold,color:muted});
    page.drawText(truncate(value,389,regular,10),{x:143,y,size:10,font:regular,color:ink});
    y-=23;
  }
  y-=23;
  page.drawText("PERSONAL ASIGNADO",{x:left,y,size:10,font:bold,color:ink});
  y-=23;
  page.drawRectangle({x:left,y:y-7,width:right-left,height:26,color:pale});
  page.drawText("NOMBRE",{x:left+11,y,size:8,font:bold,color:muted});
  page.drawText("RUT",{x:265,y,size:8,font:bold,color:muted});
  page.drawText("FUNCIÓN",{x:380,y,size:8,font:bold,color:muted});
  y-=27;
  const people=new Map<string,{name:string;rut:string;roles:string[]}>();
  for(const member of composer.members){
    const key=member.staffId||member.rut||member.name;
    const role=member.roleLabel+(member.block&&!/^(operadores|montaje|desmontaje|supervisores)$/i.test(member.block)?" · "+member.block:"");
    const previous=people.get(key);
    if(previous){if(!previous.roles.includes(role))previous.roles.push(role);}
    else people.set(key,{name:member.name,rut:member.rut,roles:[role]});
  }
  for(const person of people.values()){
    const roles=person.roles.join(" / ");
    const roleLines=roles.length>38?[roles.slice(0,38),roles.slice(38)]:[roles];
    const rowHeight=Math.max(29,roleLines.length*13+12);
    ensure(rowHeight+10);
    page.drawText(truncate(person.name,202,bold,9),{x:left+11,y,size:9,font:bold,color:ink});
    page.drawText(truncate(formatChileanRut(person.rut),105,regular,9),{x:265,y,size:9,font:regular,color:ink});
    roleLines.forEach((v,i)=>page.drawText(truncate(v,165,regular,8.5),{x:380,y:y-i*13,size:8.5,font:regular,color:muted}));
    y-=rowHeight;
    page.drawLine({start:{x:left,y:y+10},end:{x:right,y:y+10},thickness:.5,color:line});
  }
  ensure(74);
  y-=25;
  page.drawLine({start:{x:left,y},end:{x:right,y},thickness:1,color:line});
  y-=21;
  page.drawText("RESPONSABLE DEL EVENTO",{x:left,y,size:8,font:bold,color:muted});
  y-=17;
  page.drawText(OFFICIAL_ROSTER_RESPONSIBLE.name+" · "+OFFICIAL_ROSTER_RESPONSIBLE.phone,{x:left,y,size:9,font:regular,color:ink});
  for(const [index,p] of pdf.getPages().entries()){
    p.drawLine({start:{x:left,y:44},end:{x:right,y:44},thickness:.5,color:line});
    p.drawText("BOOMBOX® · Documento oficial del evento",{x:left,y:28,size:7,font:regular,color:muted});
    p.drawText((index+1)+" / "+pdf.getPageCount(),{x:529,y:28,size:7,font:regular,color:muted});
  }
  return {bytes:await pdf.save(),filename:"Nomina-Oficial-"+safeFilename(composer.eventName)+".pdf"};
}

export async function sendOfficialRoster(input:{projectId:string;actorId:string;requestId:string;fingerprint:string;to:string}) {
  const composer=await loadOfficialRoster(input.projectId);
  if(composer.fingerprint!==input.fingerprint)throw new Error("La nómina cambió. Vuelve a abrir la vista previa.");
  if(!composer.canGenerate)throw new Error(composer.missing.join(" "));
  const to=normalizeEmailRecipients({to:input.to,cc:[]}).to, admin=createAdminClient();
  const key="official-staff-roster:"+input.projectId+":"+input.requestId;
  const {data:already,error:readError}=await admin.from("communications").select("id,status,to_recipient,sent_at,occurred_at").eq("project_id",input.projectId).eq("communication_type","OFFICIAL_STAFF_ROSTER").eq("request_key",key).maybeSingle();
  if(readError)throw readError;
  if(already?.status==="SENT")return {status:"SENT" as const,recipient:already.to_recipient??to,deduplicated:true};
  const subject="Nómina oficial BOOMBOX · "+rosterDate(composer.eventDate);
  const escapeHtml=(value:string)=>plain(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const eventName=escapeHtml(composer.eventName), eventDate=escapeHtml(rosterDate(composer.eventDate));
  const htmlBody='<div style="margin:0;padding:28px 14px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#202124"><div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e9e9e9"><div style="padding:32px 36px 20px;border-bottom:1px solid #e8e8e8"><div style="font-size:25px;font-weight:800;letter-spacing:1.5px;color:#171719">BOOMBOX®</div><div style="margin-top:6px;font-size:10px;letter-spacing:1.8px;color:#777">PRODUCCIÓN DE EVENTOS</div></div><div style="padding:29px 36px 35px"><div style="font-size:18px;font-weight:700">Nómina oficial · '+eventName+'</div><div style="margin-top:7px;color:#777;font-size:13px">'+eventDate+'</div><div style="height:2px;width:32px;background:#f56e0a;margin:24px 0"></div><p style="font-size:14px;line-height:1.7;margin:0 0 18px">Estimada/o '+escapeHtml(composer.customerName||"equipo")+':</p><p style="font-size:14px;line-height:1.8;margin:0 0 18px">Adjuntamos la nómina oficial del equipo BOOMBOX® asignado a tu evento, con sus funciones y datos de identificación.</p><p style="font-size:14px;line-height:1.7;margin:0 0 22px">Quedamos atentos ante cualquier requerimiento.</p><p style="font-size:14px;line-height:1.7;margin:0">Saludos cordiales,<br><strong>Equipo BOOMBOX®</strong></p></div><div style="border-top:1px solid #e8e8e8;padding:16px 36px;color:#888;font-size:11px">BOOMBOX® · Producción de eventos</div></div></div>';
  const textBody=["Nómina oficial · "+composer.eventName,rosterDate(composer.eventDate),"","Estimada/o "+(composer.customerName||"equipo")+":","","Adjuntamos la nómina oficial del equipo BOOMBOX® asignado a tu evento, con sus funciones y datos de identificación.","","Quedamos atentos ante cualquier requerimiento.","","Saludos cordiales,","Equipo BOOMBOX®"].join(String.fromCharCode(10));
  const {bytes,filename}=await makeOfficialRosterPdf(composer);
  const {data:record,error:insertError}=await admin.from("communications").insert({customer_id:(await admin.from("projects").select("customer_id").eq("id",input.projectId).single()).data?.customer_id,project_id:input.projectId,channel:"GMAIL",direction:"OUTBOUND",communication_type:"OFFICIAL_STAFF_ROSTER",thread_key:key,request_key:key,subject,body:textBody,status:"QUEUED",to_recipient:to,cc_recipients:[],occurred_at:new Date().toISOString(),created_by:input.actorId,sent_by:input.actorId,context_snapshot:{rendererVersion:"OFFICIAL_STAFF_ROSTER_PREMIUM_V2",fingerprint:composer.fingerprint,staffCount:composer.members.length,responsible:OFFICIAL_ROSTER_RESPONSIBLE}}).select("id").single();
  if(insertError)throw insertError;
  try{
    const provider=new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const sent=await provider.send({to,idempotencyKey:key,subject,textBody,htmlBody,driveFileIds:[],attachments:[{filename,mimeType:"application/pdf",content:bytes}]});
    const sentAt=new Date().toISOString();
    const {error}=await admin.from("communications").update({status:"SENT",sent_at:sentAt,external_message_id:sent.messageId}).eq("id",record.id);
    if(error)throw error;
    await admin.from("timeline_events").insert({customer_id:(await admin.from("projects").select("customer_id").eq("id",input.projectId).single()).data?.customer_id,project_id:input.projectId,orbit_event_id:composer.orbitEventId||null,actor_id:input.actorId,actor_label:"Administración",source:"Staff",action:"OFFICIAL_STAFF_ROSTER_SENT",entity_type:"Communication",entity_id:record.id,event_type:"OFFICIAL_STAFF_ROSTER_SENT",title:"Nómina oficial enviada al cliente",description:"Nómina oficial enviada a "+to+".",human_message:"Nómina oficial del evento enviada a "+to+".",correlation_id:key,created_by:input.actorId});
    return {status:"SENT" as const,recipient:to,deduplicated:false};
  }catch(error){await admin.from("communications").update({status:"FAILED",failure_reason:error instanceof Error?error.message.slice(0,500):"Error de envío"}).eq("id",record.id);throw error;}
}
