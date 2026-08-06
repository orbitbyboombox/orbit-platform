import { HomeExperience } from "@/features/dashboard/components/home-experience";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  let projects;
  try {
    projects = await new SupabaseCustomerRepository(await createSupabaseServerClient()).findAll();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "PGRST303") {
      redirect("/api/auth/session-expired");
    }
    throw error;
  }
  return <HomeExperience projects={projects} />;
}
