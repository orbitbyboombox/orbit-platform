import { redirect } from "next/navigation";
import { OfficeRentCenter, loadOfficeLeaseDataset } from "@/features/office-rent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OfficeRentPage() {
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");
  return <OfficeRentCenter data={await loadOfficeLeaseDataset(client)}/>;
}
