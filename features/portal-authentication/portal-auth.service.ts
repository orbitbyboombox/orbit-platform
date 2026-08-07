import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const CUSTOMER_SESSION_COOKIE="orbit_customer_portal_session";
export const STAFF_SESSION_COOKIE="orbit_staff_portal_session";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

export async function loadPortalSession(type:"CUSTOMER"|"STAFF"){
  const store=await cookies();const raw=store.get(type==="CUSTOMER"?CUSTOMER_SESSION_COOKIE:STAFF_SESSION_COOKIE)?.value;if(!raw)return null;
  const admin=createAdminClient();const now=new Date().toISOString();
  const {data,error}=await admin.from("portal_access_sessions").select("id,access_type,customer_id,project_id,staff_id,expires_at").eq("token_hash",hash(raw)).eq("access_type",type).gt("expires_at",now).is("revoked_at",null).maybeSingle();
  if(error||!data)return null;await admin.from("portal_access_sessions").update({last_accessed_at:now}).eq("id",data.id);return data;
}

export async function revokePortalSession(type:"CUSTOMER"|"STAFF"){
  const store=await cookies();const name=type==="CUSTOMER"?CUSTOMER_SESSION_COOKIE:STAFF_SESSION_COOKIE;const raw=store.get(name)?.value;
  if(raw)await createAdminClient().from("portal_access_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",hash(raw));store.delete(name);
}

export function requestEvidence(headersList:Headers){const forwarded=headersList.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";const userAgent=headersList.get("user-agent")||"unknown";const device=/mobile/i.test(userAgent)?"Mobile":/tablet|ipad/i.test(userAgent)?"Tablet":"Desktop";return{ipHash:hash(forwarded),userAgent,device};}
