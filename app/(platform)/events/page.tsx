import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventCenter } from "@/features/crm/event-center";
import { loadCrmOperationalEvents } from "@/features/crm/events-repository";

export default async function EventsPage({searchParams}:{searchParams:Promise<{projectId?:string;returnTo?:string}>}){const[{projectId,returnTo},client]=await Promise.all([searchParams,createSupabaseServerClient()]);const[{data:auth},events]=await Promise.all([client.auth.getUser(),loadCrmOperationalEvents(client)]);const{data:profile}=auth.user?await client.from("profiles").select("role").eq("id",auth.user.id).maybeSingle():{data:null};const safeReturnTo=projectId&&returnTo===`/projects/${projectId}`?returnTo:undefined;return <EventCenter canForceDelete={profile?.role==="CEO"} initialEvents={events} initialProjectId={projectId} returnTo={safeReturnTo}/>;}
