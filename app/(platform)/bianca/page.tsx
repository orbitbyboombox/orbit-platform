import { redirect } from "next/navigation";
import { BiancaWorkspace } from "@/features/bianca-workspace/bianca-workspace";
import { getBiancaDeliveryLabels, getBiancaOperationalStatus } from "@/features/bianca-workspace/bianca-status";
import { loadCommunicationHubProjection } from "@/features/communication-hub";
import { loadIntegrationHealth } from "@/features/integration-health/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BiancaPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login?next=%2Fbianca");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");
  const [projection, health] = await Promise.all([loadCommunicationHubProjection(client), loadIntegrationHealth()]);
  const whatsappConnected = health.whatsapp.some((item) => item.label === "Configuración webhook" && item.status === "PASS");
  const status = getBiancaOperationalStatus({ whatsappConnected, active: projection.whatsappSummary.active, human: projection.whatsappSummary.human });
  void searchParams;
  return <BiancaWorkspace deliveryLabels={getBiancaDeliveryLabels()} projection={projection} status={status} whatsappConnected={whatsappConnected} />;
}
