import { notFound } from "next/navigation";
import { CustomerProfile, loadCrmCustomerProfile } from "@/features/crm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCrmCustomerOperations } from "@/features/crm/customer-operations.repository";
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const client = await createSupabaseServerClient();
  const customer = await loadCrmCustomerProfile(client, customerId);
  if (!customer) notFound();
  const operations = await loadCrmCustomerOperations(client, customer.events.map((event) => event.projectId));
  return <CustomerProfile customer={customer} operations={operations} />;
}
