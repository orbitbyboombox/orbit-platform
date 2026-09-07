"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { normalizeChileanPhone } from "@/lib/chile/rut";

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
async function admin() {
  const client = await createSupabaseServerActionClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Administración puede gestionar onboarding.");
  return { client, user: data.user };
}
export async function inviteStaffAction(form: FormData) {
  try {
    const { client, user } = await admin();
    const firstName = String(form.get("firstName") ?? "").trim(),
      lastName = String(form.get("lastName") ?? "").trim(),
      email = String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      mobile = normalizeChileanPhone(String(form.get("mobile") ?? "").trim());
    if (
      !firstName ||
      !lastName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !mobile
    )
      throw new Error("Completa nombre, apellido, correo y móvil.");
    const token = randomBytes(32).toString("hex"),
      expires = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error } = await client.from("staff_onboarding_invitations").insert({
      token_hash: hash(token),
      first_name: firstName,
      last_name: lastName,
      email,
      mobile,
      expires_at: expires,
      created_by: user.id,
    });
    if (error) throw error;
    const url = `${appUrl()}/staff/onboarding/${token}`;
    await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: email,
      subject: "Completa tu registro Staff BOOMBOX",
      textBody: `Hola ${firstName}. Completa tu registro seguro en ${url}. El enlace vence en 7 días.`,
      htmlBody: `<main style="font-family:Arial,sans-serif;color:#171717"><h1>Staff BOOMBOX</h1><p>Hola ${firstName}, completa tu información para incorporarte al equipo operacional.</p><p><a href="${url}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Completar mi registro</a></p><p>Este enlace es personal y vence en 7 días.</p></main>`,
      driveFileIds: [],
    });
    revalidatePath("/resources/staff");
    revalidatePath("/operations");
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { ok: true, message: `Invitación enviada a ${email}.` };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible enviar la invitación.",
    };
  }
}
export async function reviewStaffOnboardingAction(form: FormData) {
  try {
    const { client } = await admin();
    const invitationId = String(form.get("invitationId") ?? ""),
      action = String(form.get("action") ?? ""),
      notes = String(form.get("notes") ?? "").trim();
    if (action !== "APPROVE" && !notes)
      throw new Error("Indica el motivo para rechazar o solicitar cambios.");
    const { data: invitation } = await client
      .from("staff_onboarding_invitations")
      .select("first_name,email")
      .eq("id", invitationId)
      .single();
    const { error } = await client.rpc("review_staff_onboarding", {
      p_invitation_id: invitationId,
      p_action: action,
      p_notes: notes || null,
    });
    if (error) throw error;
    if (action === "REQUEST_CHANGES" && invitation) {
      const token = randomBytes(32).toString("hex");
      const { error: tokenError } = await client
        .from("staff_onboarding_invitations")
        .update({
          token_hash: hash(token),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        })
        .eq("id", invitationId);
      if (tokenError) throw tokenError;
      const url = `${appUrl()}/staff/onboarding/${token}`;
      await new GoogleGmailApiProvider(
        await loadGoogleWorkspaceAccessToken(),
      ).send({
        to: invitation.email,
        subject: "Cambios solicitados en tu registro Staff BOOMBOX",
        textBody: `Hola ${invitation.first_name}. Revisa los cambios solicitados: ${notes}. Actualiza tu registro en ${url}.`,
        htmlBody: `<main style="font-family:Arial,sans-serif;color:#171717"><h1>Actualización de registro</h1><p>Hola ${invitation.first_name}, el Founder solicitó los siguientes cambios:</p><p><strong>${notes}</strong></p><p><a href="${url}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Actualizar mi registro</a></p></main>`,
        driveFileIds: [],
      });
    }
    revalidatePath("/resources/staff");
    revalidatePath("/operations");
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        action === "APPROVE"
          ? "Colaborador aprobado y Portal Staff habilitado."
          : action === "REJECT"
            ? "Postulación rechazada."
            : "Cambios solicitados.",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible revisar el registro.",
    };
  }
}

async function sendOnboardingEmail(email:string,firstName:string,token:string,idempotencyKey?:string){
  const url=`${appUrl()}/staff/onboarding/${token}`;
  return new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({to:email,subject:"Completa tu registro Staff BOOMBOX",idempotencyKey,textBody:`Hola ${firstName}. Completa tu registro seguro en ${url}. El enlace vence en 7 días.`,htmlBody:`<main style="font-family:Arial,sans-serif;color:#171717"><h1>Staff BOOMBOX</h1><p>Hola ${firstName}, completa tu información para incorporarte al equipo operacional.</p><p><a href="${url}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Completar mi registro</a></p></main>`,driveFileIds:[]});
}

export async function manageStaffInvitationAction(form:FormData){
  let resendCorrelation = "";
  try{
    const{client}=await admin();const id=String(form.get("invitationId")??"");const action=String(form.get("action")??"");
    if(action==="RESEND") console.info(JSON.stringify({event:"staff_invitation_resend_auth_ok",invitationId:id}));
    const{data:item,error:readError}=await client.from("staff_onboarding_invitations").select("id,first_name,last_name,email,mobile,status,staff_id,last_resend_request_id,last_resend_provider_message_id,resend_count").eq("id",id).single();if(readError)throw readError;
    if(action==="RESEND") console.info(JSON.stringify({event:"staff_invitation_resend_candidate_ok",invitationId:id,status:item.status}));
    if(item.status==="APPROVED")throw new Error("Un colaborador aprobado no se elimina. Desactívalo o archívalo desde su perfil Staff.");
    if(action==="EDIT"){
      const payload={first_name:String(form.get("firstName")??"").trim(),last_name:String(form.get("lastName")??"").trim(),email:String(form.get("email")??"").trim().toLowerCase(),mobile:normalizeChileanPhone(String(form.get("mobile")??"").trim()),updated_at:new Date().toISOString()};
      if(!payload.first_name||!payload.last_name||!payload.mobile||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))throw new Error("Completa los datos de la invitación.");
      const{error}=await client.from("staff_onboarding_invitations").update(payload).eq("id",id);if(error)throw error;
    }else if(action==="RESEND"){
      if(!["INVITED","OPENED","CHANGES_REQUESTED","SUBMITTED"].includes(item.status))throw new Error("Esta invitación no está disponible para reenvío.");
      const requestId=String(form.get("requestId")??"").trim();if(!requestId)throw new Error("Solicitud de reenvío inválida.");
      if(item.last_resend_request_id===requestId&&item.last_resend_provider_message_id)return{ok:true,message:`Invitación reenviada a ${item.email}.`};
      const correlationId=`staff-invitation-resend:${id}:${requestId}`;
      resendCorrelation = correlationId;
      console.info(JSON.stringify({event:"staff_invitation_resend_start",correlationId,invitationId:id}));
      const token=randomBytes(32).toString("hex");const{error}=await client.from("staff_onboarding_invitations").update({token_hash:hash(token),expires_at:new Date(Date.now()+7*86400000).toISOString(),last_resend_at:new Date().toISOString(),last_resend_request_id:requestId,last_resend_provider_message_id:null,resend_count:(Number(item.resend_count)||0)+1,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
      console.info(JSON.stringify({event:"staff_invitation_resend_token_ready",correlationId,invitationId:id}));
      try {
        console.info(JSON.stringify({event:"staff_invitation_resend_provider_start",correlationId,invitationId:id}));
        const delivered=await sendOnboardingEmail(item.email,item.first_name,token,correlationId);
        await client.from("staff_onboarding_invitations").update({last_resend_provider_message_id:delivered.messageId,updated_at:new Date().toISOString()}).eq("id",id).eq("last_resend_request_id",requestId);
        await client.from("audit_events").insert({entity_type:"STAFF_ONBOARDING_INVITATION",entity_id:id,action:"INVITATION_RESENT",reason:"Founder reenvió invitación de onboarding.",new_state:{correlationId,providerMessageId:delivered.messageId}});
        console.info(JSON.stringify({event:"staff_invitation_resend_provider_success",correlationId,invitationId:id}));
        console.info(JSON.stringify({event:"staff_invitation_resend_complete",correlationId,invitationId:id}));
      } catch (providerError) {
        console.error(JSON.stringify({event:"staff_invitation_resend_failed",stage:"provider",correlationId,invitationId:id,error:providerError instanceof Error?providerError.message:"provider_error"}));
        throw providerError;
      }
    }else if(action==="CANCEL"){
      const{error}=await client.from("staff_onboarding_invitations").update({status:"CANCELLED",updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
    }else if(action==="DELETE"){
      if(!["INVITED","OPENED","CHANGES_REQUESTED","REJECTED","CANCELLED","EXPIRED"].includes(item.status))throw new Error("Solo las invitaciones pendientes sin aprobación pueden eliminarse.");
      const{error}=await client.from("staff_onboarding_invitations").delete().eq("id",id).is("staff_id",null);if(error)throw error;
    }else throw new Error("Acción no válida.");
    revalidatePath("/resources/staff");return{ok:true,message:action==="RESEND"?"Invitación reenviada.":action==="DELETE"?"Invitación eliminada.":action==="CANCEL"?"Invitación cancelada.":"Invitación actualizada."};
  }catch(error){return{ok:false,error:`${error instanceof Error?error.message:"No fue posible gestionar la invitación."}${resendCorrelation?` · Referencia: ${resendCorrelation.slice(-12)}`:""}`};}
}
