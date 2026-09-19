import {
  CommercialHub,
  loadCommercialHubData,
} from "@/features/commercial-hub";
import {
  CommunicationHub,
  loadCommunicationHubProjection,
} from "@/features/communication-hub";
import { WhatsAppInbox } from "@/features/communication-hub/components/whatsapp-inbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSalesPipeline, SalesPipeline } from "@/features/sales-pipeline";
import { whatsappDeliveryEnabled } from "@/features/connectors/whatsapp-cloud/meta-whatsapp-cloud";

export default async function LeadsPage() {
  const client = await createSupabaseServerClient();
  const [commercial, communication, pipeline] = await Promise.all([
    loadCommercialHubData(client),
    loadCommunicationHubProjection(client),
    loadSalesPipeline(),
  ]);

  return (
    <>
      <CommercialHub data={commercial} />
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-10 sm:px-6 lg:px-8">
        <CommunicationHub
          conversations={communication.conversations}
          events={communication.events}
          indicators={communication.indicators}
        />
        <div className="mt-6"><WhatsAppInbox conversations={communication.conversations} deliveryEnabled={whatsappDeliveryEnabled()} events={communication.events} /></div>
      </div>
      <SalesPipeline data={pipeline} />
    </>
  );
}
