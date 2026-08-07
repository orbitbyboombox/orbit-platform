"use server";
import{revalidatePath}from"next/cache";import{createSupabaseServerActionClient}from"@/lib/supabase/server";
async function mutate(notificationId:string,kind:"READ"|"ARCHIVE"|"DISMISS"){const client=await createSupabaseServerActionClient();const{data,error:authError}=await client.auth.getUser();if(authError||!data.user)throw authError??new Error("Sesión requerida.");const now=new Date().toISOString();const payload={notification_id:notificationId,user_id:data.user.id,read_at:now,archived_at:kind==="ARCHIVE"?now:null,dismissed_at:kind==="DISMISS"?now:null,updated_at:now};const{error}=await client.from("notification_user_states").upsert(payload,{onConflict:"notification_id,user_id"});if(error)throw error;revalidatePath("/notifications");revalidatePath("/", "layout");return{ok:true as const}}
export async function markNotificationReadAction(id:string){return mutate(id,"READ")}
export async function archiveNotificationAction(id:string){return mutate(id,"ARCHIVE")}
export async function dismissNotificationAction(id:string){return mutate(id,"DISMISS")}
