import { HomeExperience } from "@/features/dashboard/components/home-experience";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const projects = await new SupabaseCustomerRepository(await createSupabaseServerClient()).findAll();
  return <HomeExperience projects={projects} />;
}
