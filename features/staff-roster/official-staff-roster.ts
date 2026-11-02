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
  const dark=rgb(.08,.08,.09), orange=rgb(.96,.43,.05), muted=rgb(.4,.41,.44), white=rgb(1,1,1), rule=rgb(.86,.86,.87);
  const size:[number,number]=[595.28,841.89]; let page=pdf.addPage(size), y=0;
  const header=()=>{const top=page.getHeight();page.drawRectangle({x:0,y:top-124,width:size[0],height:124,color:dark});page.drawText("BOOMBOX",{x:42,y:top-47,size:25,font:bold,color:white});page.drawText("NÓMINA OFICIAL DEL EQUIPO",{x:42,y:top-77,size:13,font:bold,color:orange});page.drawText(plain(composer.orbitEventId||composer.eventName).slice(0,70),{x:42,y:top-101,size:9,font:regular,color:rgb(.84,.84,.86)});y=top-154;};
  const next=()=>{page=pdf.addPage(size);header();}; const ensure=(h:number)=>{if(y-h<70)next();}; header();
  const isCcuRoster = /\bCCU\b/i.test([composer.eventName, composer.customerName].join(" "));
  const details:[string,string][]=[["EVENTO",composer.eventName],["FECHA",rosterDate(composer.eventDate)],["HORARIO",isCcuRoster?"AM 09:00 a 13:30 hrs / PM 15:00 a 19:30 hrs":composer.eventTime||"Por confirmar"],...(isCcuRoster?[["CITACIÓN","AM 08:00 hrs / PM 14:00 hrs"] as [string,string]]:[]),["LUGAR",[composer.location,composer.city].filter(Boolean).join(" · ")||"Por confirmar"]];
  for(const d of details){page.drawText(d[0],{x:42,y,size:7,font:bold,color:muted});page.drawText(plain(d[1]).slice(0,78),{x:145,y,size:9,font:regular,color:dark});y-=17;} y-=9;
  const groups=new Map<string,RosterMember[]>(); for(const m of composer.members)groups.set(m.block,[...(groups.get(m.block)||[]),m]);
  for(const [block,members] of groups){ensure(44);page.drawRectangle({x:42,y:y-6,width:511,height:23,color:dark});page.drawText(plain(block.toUpperCase()).slice(0,45),{x:52,y:y+1,size:9,font:bold,color:orange});y-=25;
    for(const m of members){ensure(27);page.drawText(plain(m.name).slice(0,37),{x:52,y,size:8.5,font:bold,color:dark});page.drawText(formatChileanRut(m.rut),{x:280,y,size:8.5,font:regular,color:dark});page.drawText(plain(m.roleLabel),{x:420,y,size:8,font:regular,color:muted});y-=16;}y-=8;
  }
  ensure(78);page.drawLine({start:{x:42,y:y-3},end:{x:553,y:y-3},thickness:1,color:orange});y-=21;page.drawText("RESPONSABLE / BACK UP",{x:42,y,size:8,font:bold,color:orange});y-=15;page.drawText(OFFICIAL_ROSTER_RESPONSIBLE.name+" · RUT "+OFFICIAL_ROSTER_RESPONSIBLE.rut,{x:42,y,size:9,font:bold,color:dark});y-=14;page.drawText("Contacto: "+OFFICIAL_ROSTER_RESPONSIBLE.phone,{x:42,y,size:9,font:regular,color:dark});
  for(const [i,p] of pdf.getPages().entries()){p.drawLine({start:{x:42,y:42},end:{x:553,y:42},thickness:.5,color:rule});p.drawText("BOOMBOX · Nómina oficial del evento",{x:42,y:26,size:7,font:regular,color:muted});p.drawText((i+1)+" / "+pdf.getPageCount(),{x:530,y:26,size:7,font:regular,color:muted});}
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
  const greeting=plain(composer.customerName||"equipo").replace(/[&<>"]/g,"");
  const htmlBody='<main style="font-family:Arial,sans-serif;color:#171719;line-height:1.65"><header style="background:#171719;padding:26px 30px;color:#fff"><b style="font-size:21px;letter-spacing:2px">BOOMBOX</b><div style="margin-top:8px;color:#f56e0a;font-size:12px;font-weight:700">NÓMINA OFICIAL DEL EQUIPO</div></header><section style="padding:26px 30px"><p>Hola '+greeting+',</p><p>Junto con saludar, adjuntamos la nómina oficial del equipo BOOMBOX que participará en <b>'+plain(composer.eventName).replace(/[&<>"]/g,"")+'</b> el <b>'+rosterDate(composer.eventDate)+'</b>.</p><p>El documento presenta al equipo organizado por bloque y función, con sus datos de identificación.</p><p style="border-left:3px solid #f56e0a;padding:10px 14px;background:#f6f6f7"><b>Responsable / Back up:</b> '+OFFICIAL_ROSTER_RESPONSIBLE.name+'<br>RUT '+OFFICIAL_ROSTER_RESPONSIBLE.rut+' · '+OFFICIAL_ROSTER_RESPONSIBLE.phone+'</p><p>Quedamos atentos.<br><b>Equipo BOOMBOX</b></p></section></main>';
  const textBody="Hola "+(composer.customerName||"equipo")+",\n\nAdjuntamos la nómina oficial del equipo BOOMBOX para "+composer.eventName+", el "+rosterDate(composer.eventDate)+".\n\nResponsable / Back up: "+OFFICIAL_ROSTER_RESPONSIBLE.name+" · RUT "+OFFICIAL_ROSTER_RESPONSIBLE.rut+" · "+OFFICIAL_ROSTER_RESPONSIBLE.phone+"\n\nEquipo BOOMBOX";
  const {bytes,filename}=await makeOfficialRosterPdf(composer);
  const {data:record,error:insertError}=await admin.from("communications").insert({customer_id:(await admin.from("projects").select("customer_id").eq("id",input.projectId).single()).data?.customer_id,project_id:input.projectId,channel:"GMAIL",direction:"OUTBOUND",communication_type:"OFFICIAL_STAFF_ROSTER",thread_key:key,request_key:key,subject,body:textBody,status:"QUEUED",to_recipient:to,cc_recipients:[],occurred_at:new Date().toISOString(),created_by:input.actorId,sent_by:input.actorId,context_snapshot:{rendererVersion:"OFFICIAL_STAFF_ROSTER_V1",fingerprint:composer.fingerprint,staffCount:composer.members.length,responsible:OFFICIAL_ROSTER_RESPONSIBLE}}).select("id").single();
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
