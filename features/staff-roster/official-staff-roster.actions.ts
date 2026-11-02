"use server";
import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { loadOfficialRoster, makeOfficialRosterPdf, saveOfficialRosterBlock, sendOfficialRoster } from "./official-staff-roster";

async function actor() {
  const client=await createSupabaseServerActionClient();
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw error??new Error("Sesión requerida.");
  const {data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",data.user.id).single();
  if(profileError)throw profileError;
  if(!isAdministrativeRole(profile.role))throw new Error("Solo Founder o Administración puede gestionar la nómina oficial.");
  return data.user.id;
}
const message=(error:unknown)=>error instanceof Error?error.message:"No fue posible completar la operación.";

export async function getOfficialRosterPreviewAction(projectId:string) {
  try { await actor(); return {ok:true as const,composer:await loadOfficialRoster(projectId)}; }
  catch(error) { return {ok:false as const,error:message(error)}; }
}
export async function saveOfficialRosterBlockAction(input:{projectId:string;assignmentId:string;block:string}) {
  try {
    const actorId=await actor();
    await saveOfficialRosterBlock({...input,actorId});
    revalidatePath("/projects/"+input.projectId);
    return {ok:true as const};
  } catch(error) { return {ok:false as const,error:message(error)}; }
}
export async function downloadOfficialRosterAction(projectId:string) {
  try {
    await actor();
    const composer=await loadOfficialRoster(projectId);
    if(!composer.canGenerate)return {ok:false as const,error:composer.missing.join(" "),missing:composer.missing};
    const pdf=await makeOfficialRosterPdf(composer);
    return {ok:true as const,filename:pdf.filename,base64:Buffer.from(pdf.bytes).toString("base64")};
  } catch(error) { return {ok:false as const,error:message(error)}; }
}
export async function sendOfficialRosterAction(input:{projectId:string;requestId:string;fingerprint:string;to:string}) {
  try {
    const actorId=await actor();
    const result=await sendOfficialRoster({...input,actorId});
    revalidatePath("/projects/"+input.projectId);
    return {ok:true as const,result,message:"Nómina oficial enviada a "+result.recipient+"."};
  } catch(error) { return {ok:false as const,error:message(error)}; }
}
