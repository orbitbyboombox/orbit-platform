import { ProjectsPage } from "@/features/projects/components/projects-page";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectsRoute() {
  const client = await createSupabaseServerClient();
  const repository = new SupabaseCustomerRepository(client);
  const projects = await repository.findAll();
  return <ProjectsPage initialProjects={projects} />;
}
