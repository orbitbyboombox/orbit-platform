import { resolveEventAddress } from "@/lib/event-location";
import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatChileanRut, isValidChileanRut } from "@/lib/chile/rut";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";

import { buildRosterGroups } from "./official-roster-members";
import { OFFICIAL_ROSTER_PLATES } from "./official-roster-vehicles";

// Preserve the official BOOMBOX event lead from roster V1.
export const OFFICIAL_ROSTER_RESPONSIBLE = { name: "Matías Maira", rut: "16.357.402-0", phone: "+56 9 7306 9315" } as const;

export type RosterTotemRow = { position:string; location:string; reference:string; box:string; block:string; operator:string };
export type RosterComposer = { totemRows: RosterTotemRow[]; projectId: string; orbitEventId: string; eventName: string; eventDate: string; eventTime: string; staffArrivalAt: string | null; serviceStartAt: string | null; serviceEndAt: string | null; location: string; address?: string; city: string; customerName: string; recipient: string; fingerprint: string; groups: ReturnType<typeof buildRosterGroups>["groups"]; responsible: { name: string; rut: string } | null; missing: string[]; canGenerate: boolean };

const blockValue = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 50) : "";
export function rosterDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]), 12)));
}
const rosterClock = (value: string | null) => {
  if (!value) return "Por confirmar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Por confirmar";
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) + " hrs";
};
const rosterEnd = (start: string | null, end: string | null) => {
  const clock = rosterClock(end);
  if (!start || !end || clock === "Por confirmar") return clock;
  const day = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return clock + (day(end) > day(start) ? " (+1 día)" : "");
};
const safeFilename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "evento";
const plain = (value: string) => value.replace(/[\u0000-\u001f]/g, " ").trim();

export async function loadOfficialRoster(projectId: string): Promise<RosterComposer> {
  const admin = createAdminClient();
  const [p, a, blockResult, assetResult] = await Promise.all([
    admin.from("projects").select("id,orbit_event_id,name,event_date,event_time,location,city,operations,customer_id,customers!inner(full_name,email,secondary_email),project_operational_contracts(contact_email,contact_status,contact_first_name,contact_last_name,contact_phone,staff_arrival_at,service_start_at,service_end_at)").eq("id", projectId).is("deleted_at", null).single(),
    admin.from("assignments").select("id,staff_id,assignment_type,status,staff(first_name,last_name,rut)").eq("project_id", projectId).is("deleted_at", null).order("id"),
    admin.from("event_operational_blocks").select("id,name").eq("project_id", projectId),
    admin.from("operational_assets").select("id,asset_code").eq("asset_type", "CASE"),
  ]);
  if (p.error) throw p.error;
  if (a.error) throw a.error;
  if (blockResult.error) throw blockResult.error;
  if (assetResult.error) throw assetResult.error;
  const customer = Array.isArray(p.data.customers) ? p.data.customers[0] : p.data.customers;
  const contract = Array.isArray(p.data.project_operational_contracts) ? p.data.project_operational_contracts[0] : p.data.project_operational_contracts;
  const { groups, operators } = buildRosterGroups(a.data ?? []);
  const members = groups.flatMap(group => group.members);
  const contactName = contract?.contact_status === "CONFIRMED"
    ? [contract.contact_first_name, contract.contact_last_name].map(part => part?.trim()).filter(Boolean).join(" ")
    : "";
  let responsible: RosterComposer["responsible"] = null;
  // The contact in the operational contract can be external. List them as
  // event lead only when both their name and phone identify one Staff record.
  const contactFirstName = contract?.contact_first_name?.trim();
  const contactPhone = contract?.contact_phone?.replace(/\D/g, "").replace(/^56(?=\d{9}$)/, "");
  if (contactName && contactFirstName && contactPhone?.length === 9) {
    const firstNames = [...new Set([contactFirstName, contactFirstName.split(/\s+/)[0]])];
    const { data, error } = await admin.from("staff").select("first_name,last_name,phone,rut").in("first_name", firstNames);
    if (error) throw error;
    const matches = (data ?? []).filter(person =>
      [person.first_name, person.last_name].map(part => part?.trim()).filter(Boolean).join(" ").toLocaleLowerCase("es") === contactName.toLocaleLowerCase("es")
      && person.phone?.replace(/\D/g, "").replace(/^56(?=\d{9}$)/, "") === contactPhone);
    if (matches.length === 1) {
      const rut = matches[0].rut;
      responsible = { name: contactName, rut: rut && isValidChileanRut(rut) ? formatChileanRut(rut) : "" };
    }
  }
  // A confirmed operational contact may be external; do not erase the official BOOMBOX lead.
  if (!responsible) responsible = { name: OFFICIAL_ROSTER_RESPONSIBLE.name, rut: OFFICIAL_ROSTER_RESPONSIBLE.rut };
  const operations = p.data.operations && typeof p.data.operations === "object" ? p.data.operations as Record<string,unknown> : {};
  const layout = operations.totemLayout as {enabled?:boolean;positions?:Array<{label:string;location:string;reference:string;assetId:string|null;blocks:Array<{blockId:string;assignmentId:string|null}>}>}|undefined;
  const blockNames = new Map((blockResult.data??[]).map(block=>[block.id,block.name??"Bloque"]));
  const assetNames = new Map((assetResult.data??[]).map(asset=>[asset.id,asset.asset_code??"CASE"]));
  const totemRows:RosterTotemRow[] = layout?.enabled && Array.isArray(layout.positions) ? layout.positions.flatMap(position=>position.blocks.map(block=>({
    position:position.label,location:position.location||"Por definir",reference:position.reference||"—",
    box:position.assetId?assetNames.get(position.assetId)??"CASE sin identificar":"Sin asignar",
    block:blockNames.get(block.blockId)??"Bloque",operator:block.assignmentId?operators.get(block.assignmentId)??"Operador sin identificar":"Pendiente",
  }))) : [];
  const missing:string[] = [];
  if (!members.length && !responsible) missing.push("No hay integrantes asignados.");
  for (const member of members) {
    member.rut = isValidChileanRut(member.rut) ? formatChileanRut(member.rut) : "";
  }
  for (const member of new Map(members.map(row => [row.staffId, row])).values()) {
    if (!member.name || !member.rut) missing.push("Revisa el nombre y el RUT de " + (member.name || "un integrante") + ".");
  }
  const name = p.data.name || p.data.orbit_event_id || "Evento BOOMBOX";
  const roster = { totemRows, projectId, orbitEventId:p.data.orbit_event_id ?? "", eventName:name, eventDate:p.data.event_date ?? "", eventTime:p.data.event_time ?? "", staffArrivalAt:contract?.staff_arrival_at ?? null, serviceStartAt:contract?.service_start_at ?? null, serviceEndAt:contract?.service_end_at ?? null, location:p.data.location ?? "", address:resolveEventAddress(operations), city:p.data.city ?? "", customerName:customer?.full_name ?? "", recipient:contract?.contact_email ?? customer?.email ?? "", groups, responsible, missing, canGenerate:members.length>0 || responsible!==null };
  const fingerprint = createHash("sha256").update(JSON.stringify(roster)).digest("hex");
  return { ...roster, fingerprint };
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

export async function makeOfficialRosterPdf(composer:RosterComposer, includeCases = false) {
  if (!composer.canGenerate) throw new Error(composer.missing.join(" "));
  const pdf=await PDFDocument.create(), regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(join(process.cwd(), "public/branding/boombox-logo-official-white-email.png")));
  const logoSize = logo.scale(145 / logo.width);
  const ink=rgb(.11,.12,.14), muted=rgb(.42,.44,.47), line=rgb(.87,.88,.89), orange=rgb(.96,.43,.05), pale=rgb(.97,.97,.97);
  const width=595.28, height=841.89, left=43, right=552;
  let page=pdf.addPage([width,height]), y=0;
  const wrap = (value: string, maxWidth: number, font: typeof regular, fontSize: number) => {
    const lines: string[] = [];
    let line = "";
    const normalized = plain(value).normalize("NFC").replace(/\s+/g, " ");
    for (const character of normalized) {
      if (font.widthOfTextAtSize(line + character, fontSize) > maxWidth) {
        const split = line.lastIndexOf(" ");
        lines.push(split > 0 ? line.slice(0, split) : line);
        line = split > 0 ? line.slice(split + 1) : "";
      }
      line = (line + character).trimStart();
    }
    lines.push(line);
    return lines;
  };
  const header=()=>{
    page.drawRectangle({ x: 0, y: height - 76, width, height: 76, color: rgb(.06, .067, .075) });
    page.drawImage(logo, { x: left, y: height - (76 + logoSize.height) / 2, ...logoSize });
    page.drawText("NÓMINA OFICIAL",{x:left,y:height-100,size:11,font:bold,color:orange});
    page.drawText(wrap(composer.orbitEventId,190,regular,9)[0],{x:362,y:height-100,size:9,font:regular,color:muted});
    page.drawLine({start:{x:left,y:height-112},end:{x:right,y:height-112},thickness:1,color:line});
    y=height-132;
  };
  const next=()=>{page=pdf.addPage([width,height]);header();};
  const ensure=(space:number)=>{if(y-space<65)next();};
  header();
  const isCCU = composer.orbitEventId === "ORB-2026-268105";
  const details:[string,string][]=[["EVENTO",composer.eventName],["FECHA",rosterDate(composer.eventDate)],["CITACIÓN STAFF",isCCU?"AM 08:00 hrs / PM 14:00 hrs":rosterClock(composer.staffArrivalAt)],["INICIO SERVICIO",isCCU?"AM 09:00 hrs / PM 15:00 hrs":rosterClock(composer.serviceStartAt)],["FIN SERVICIO",isCCU?"AM 13:30 hrs / PM 19:30 hrs":rosterEnd(composer.serviceStartAt,composer.serviceEndAt)],["LUGAR",composer.location||"Por confirmar"],["DIRECCIÓN",composer.address||"Por confirmar"],["COMUNA",composer.city||"Por confirmar"]];
  for(const [label,value] of details){
    page.drawText(label,{x:left,y,size:8,font:bold,color:muted});
    const lines = wrap(value, 389, regular, 10);
    lines.forEach((line, index) => page.drawText(line, { x: 143, y: y - index * 13, size: 10, font: regular, color: ink }));
    y -= 23 + (lines.length - 1) * 13;
  }
  y-=23;
  const tableHeader = () => {
    page.drawText("PERSONAL ASIGNADO", { x: left, y, size: 10, font: bold, color: ink });
    y -= 23;
    page.drawRectangle({ x: left, y: y - 7, width: right - left, height: 26, color: pale });
    for (const [label, x] of [["NOMBRE", left + 11], ["RUT", 265], ["FUNCIÓN", 380]] as const) {
      page.drawText(label, { x, y, size: 8, font: bold, color: muted });
    }
    y -= 27;
  };
  tableHeader();
  const people=new Map<string,{name:string;rut:string;roles:string[]}>();
  const rosterRows = composer.groups.flatMap(group =>
    group.members.map(member => ({ ...member, role: group.label })),
  );
  for (const member of rosterRows) {
    const key = member.staffId || member.rut || member.name;
    const role = member.role;
    const previous=people.get(key);
    if(previous){if(!previous.roles.includes(role))previous.roles.push(role);}
    else people.set(key,{name:member.name,rut:member.rut,roles:[role]});
  }
  for(const person of people.values()){
    const nameLines = wrap(person.name, 202, bold, 9);
    const roleLines = wrap(person.roles.join(" / "), 165, regular, 8.5);
    const rowHeight = Math.max(29, Math.max(nameLines.length, roleLines.length) * 13 + 12);
    if (y - rowHeight - 10 < 65) {
      next();
      tableHeader();
    }
    nameLines.forEach((line, index) => page.drawText(line, { x: left + 11, y: y - index * 13, size: 9, font: bold, color: ink }));
    page.drawText(formatChileanRut(person.rut), { x: 265, y, size: 9, font: regular, color: ink });
    roleLines.forEach((line, index) => page.drawText(line, { x: 380, y: y - index * 13, size: 8.5, font: regular, color: muted }));
    y-=rowHeight;
    page.drawLine({start:{x:left,y:y+10},end:{x:right,y:y+10},thickness:.5,color:line});
  }
  ensure(87);
  y-=25;
  page.drawLine({start:{x:left,y},end:{x:right,y},thickness:1,color:line});
  y-=21;
  page.drawText("RESPONSABLE DEL EVENTO",{x:left,y,size:8,font:bold,color:muted});
  y-=17;
  if (composer.responsible) {
    const { name, rut } = composer.responsible;
    const identity = rut ? name + " · RUT " + formatChileanRut(rut) : name;
    for (const line of wrap(identity, right - left, regular, 9)) {
      page.drawText(line, { x: left, y, size: 9, font: regular, color: ink });
      y -= 13;
    }
  } else {
    page.drawText("Sin asignar", { x: left, y, size: 9, font: regular, color: muted });
    y -= 13;
  }
  ensure(72);
  y -= 23;
  page.drawText("Vehículos autorizados para montaje y desmontaje", { x: left, y, size: 10, font: bold, color: ink });
  y -= 17;
  page.drawText(OFFICIAL_ROSTER_PLATES.join(" / "), { x: left, y, size: 9, font: bold, color: ink });
  y -= 15;
  page.drawText("Cualquiera de estos vehículos oficiales de BOOMBOX® puede ingresar para montaje o desmontaje.", {
    x: left, y, size: 8.5, font: regular, color: muted,
  });
  y -= 14;
  if (includeCases && composer.totemRows.length) {
    const totemHeader = () => {
      y -= 20;
      page.drawText("DISTRIBUCIÓN MULTICAJA", { x: left, y, size: 10, font: bold, color: ink });
      y -= 19;
    };
    if (y - 85 < 65) next();
    totemHeader();
    for (const row of composer.totemRows) {
      const label = wrap(row.position + " · " + row.box + " · " + row.block + " · " + row.operator, right - left, bold, 8);
      const location = wrap(row.location + " · " + row.reference, right - left, regular, 8);
      if (y - (label.length + location.length) * 12 - 10 < 65) {
        next();
        totemHeader();
      }
      for (const line of label) {
        page.drawText(line, { x: left, y, size: 8, font: bold, color: ink });
        y -= 12;
      }
      for (const line of location) {
        page.drawText(line, { x: left, y, size: 8, font: regular, color: muted });
        y -= 12;
      }
      y -= 9;
    }
  }
  for(const [index,p] of pdf.getPages().entries()){
    p.drawLine({start:{x:left,y:44},end:{x:right,y:44},thickness:.5,color:line});
    p.drawText("BOOMBOX® · Documento oficial del evento",{x:left,y:28,size:7,font:regular,color:muted});
    p.drawText((index+1)+" / "+pdf.getPageCount(),{x:529,y:28,size:7,font:regular,color:muted});
  }
  return {bytes:await pdf.save(),filename:"Nomina-Oficial-"+safeFilename(composer.eventName)+".pdf"};
}

export async function sendOfficialRoster(input:{projectId:string;actorId:string;requestId:string;fingerprint:string;to:string;includeCases?:boolean}) {
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
  const htmlBody='<div style="margin:0;padding:28px 14px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#202124"><div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e9e9e9"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td bgcolor="#101113" style="background:#101113;color:#ffffff;padding:26px 36px"><img src="https://app.bbox.cl/branding/boombox-logo-official-white-email.png" width="176" height="40" alt="BOOMBOX®" style="display:block;width:176px;max-width:100%;height:auto;color:#ffffff;font-size:22px;font-weight:bold"><div style="margin-top:10px;font-size:10px;letter-spacing:1.8px;color:#e0e0e0">PRODUCCIÓN DE EVENTOS</div></td></tr></table><div style="padding:29px 36px 35px"><div style="font-size:18px;font-weight:700">NÓMINA OFICIAL STAFF</div><div style="margin-top:7px;color:#777;font-size:13px">'+eventDate+'</div><div style="height:2px;width:32px;background:#f56e0a;margin:24px 0"></div><p style="font-size:14px;line-height:1.7;margin:0 0 18px">Estimada/o '+escapeHtml(composer.customerName||"equipo")+':</p><p style="font-size:14px;line-height:1.8;margin:0 0 18px">Adjuntamos la nómina oficial del equipo BOOMBOX® asignado a tu evento, con sus funciones y datos de identificación.</p><p style="font-size:14px;line-height:1.7;margin:0 0 22px">Quedamos atentos ante cualquier requerimiento.</p><p style="font-size:14px;line-height:1.7;margin:0">Saludos cordiales,<br><strong>Equipo BOOMBOX®</strong></p></div><div style="border-top:1px solid #e8e8e8;padding:16px 36px;color:#888;font-size:11px">BOOMBOX® · Producción de eventos</div></div></div>';
  const scheduleText = ["Citación staff: " + rosterClock(composer.staffArrivalAt), "Inicio servicio contratado: " + rosterClock(composer.serviceStartAt), "Fin servicio contratado: " + rosterEnd(composer.serviceStartAt, composer.serviceEndAt)];
  const scheduleHtml = '<div style="font-size:13px;line-height:1.8;margin:16px 0 20px"><strong>Citación staff:</strong> '+escapeHtml(rosterClock(composer.staffArrivalAt))+'<br><strong>Inicio del servicio:</strong> '+escapeHtml(rosterClock(composer.serviceStartAt))+'<br><strong>Fin del servicio:</strong> '+escapeHtml(rosterEnd(composer.serviceStartAt,composer.serviceEndAt))+'</div>';
  const locationText = ["Lugar: " + (composer.location || "Por confirmar"), "Dirección: " + (composer.address || "Por confirmar"), "Comuna: " + (composer.city || "Por confirmar")];
  const textBody=["NÓMINA OFICIAL STAFF",rosterDate(composer.eventDate),"",...scheduleText,...locationText,"","Estimada/o "+(composer.customerName||"equipo")+":","","Adjuntamos la nómina oficial del equipo BOOMBOX® asignado a tu evento, con sus funciones y datos de identificación.","","Quedamos atentos ante cualquier requerimiento.","","Saludos cordiales,","Equipo BOOMBOX®"].join(String.fromCharCode(10));
  const emailHtml = htmlBody.replace('<p style="font-size:14px;line-height:1.8;margin:0 0 18px">Adjuntamos', scheduleHtml+'<p style="font-size:13px;line-height:1.8">'+locationText.map(escapeHtml).join("<br>")+'</p><p style="font-size:14px;line-height:1.8;margin:0 0 18px">Adjuntamos');
  const {bytes,filename}=await makeOfficialRosterPdf(composer,input.includeCases===true);
  const {data:record,error:insertError}=await admin.from("communications").insert({customer_id:(await admin.from("projects").select("customer_id").eq("id",input.projectId).single()).data?.customer_id,project_id:input.projectId,channel:"GMAIL",direction:"OUTBOUND",communication_type:"OFFICIAL_STAFF_ROSTER",thread_key:key,request_key:key,subject,body:textBody,status:"QUEUED",to_recipient:to,cc_recipients:[],occurred_at:new Date().toISOString(),created_by:input.actorId,sent_by:input.actorId,context_snapshot:{rendererVersion:"OFFICIAL_STAFF_ROSTER_V2",fingerprint:composer.fingerprint,staffCount:new Set(composer.groups.flatMap(group=>group.members.map(member=>member.staffId))).size}}).select("id").single();
  if(insertError)throw insertError;
  try{
    const provider=new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const sent=await provider.send({to,idempotencyKey:key,subject,textBody,htmlBody:emailHtml,driveFileIds:[],attachments:[{filename,mimeType:"application/pdf",content:bytes}]});
    const sentAt=new Date().toISOString();
    const {error}=await admin.from("communications").update({status:"SENT",sent_at:sentAt,external_message_id:sent.messageId}).eq("id",record.id);
    if(error)throw error;
    await admin.from("timeline_events").insert({customer_id:(await admin.from("projects").select("customer_id").eq("id",input.projectId).single()).data?.customer_id,project_id:input.projectId,orbit_event_id:composer.orbitEventId||null,actor_id:input.actorId,actor_label:"Administración",source:"Staff",action:"OFFICIAL_STAFF_ROSTER_SENT",entity_type:"Communication",entity_id:record.id,event_type:"OFFICIAL_STAFF_ROSTER_SENT",title:"Nómina oficial enviada al cliente",description:"Nómina oficial enviada a "+to+".",human_message:"Nómina oficial del evento enviada a "+to+".",correlation_id:key,created_by:input.actorId});
    return {status:"SENT" as const,recipient:to,deduplicated:false};
  }catch(error){await admin.from("communications").update({status:"FAILED",failure_reason:error instanceof Error?error.message.slice(0,500):"Error de envío"}).eq("id",record.id);throw error;}
}
