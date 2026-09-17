import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventCenter } from "@/features/crm/event-center";
import { loadCrmOperationalEvents } from "@/features/crm/events-repository";

export default async function EventsPage(){const client=await createSupabaseServerClient();const[{data:auth},events]=await Promise.all([client.auth.getUser(),loadCrmOperationalEvents(client)]);const{data:profile}=auth.user?await client.from("profiles").select("role").eq("id",auth.user.id).maybeSingle():{data:null};return <EventCenter canForceDelete={profile?.role==="CEO"} initialEvents={events}/>;}
