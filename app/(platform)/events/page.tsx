import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventCenter } from "@/features/crm/event-center";
import { loadCrmOperationalEvents } from "@/features/crm/events-repository";

export default async function EventsPage(){const client=await createSupabaseServerClient();return <EventCenter initialEvents={await loadCrmOperationalEvents(client)}/>;}
