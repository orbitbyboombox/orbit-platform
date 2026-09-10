import { CrmCalendar } from "@/features/crm/calendar";
import { loadCrmOperationalEvents } from "@/features/crm/events-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CalendarPage() {
  const client = await createSupabaseServerClient();
  return <CrmCalendar initialEvents={await loadCrmOperationalEvents(client)} />;
}
