import {
  CommercialHub,
  loadCommercialHubData,
} from "@/features/commercial-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function LeadsPage() {
  const client = await createSupabaseServerClient();
  return <CommercialHub data={await loadCommercialHubData(client)} />;
}
