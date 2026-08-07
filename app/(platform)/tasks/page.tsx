import { TaskCenter, SupabaseTaskCenterRepository } from "@/features/task-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TasksPage(){
  const client=await createSupabaseServerClient();
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth.user) throw authError??new Error("Sesión requerida.");
  const repository=new SupabaseTaskCenterRepository(client);
  await repository.materializeScheduledTasks();
  const [tasks,profilesResult,projectsResult]=await Promise.all([
    repository.findAll(),
    client.from("profiles").select("id,display_name").order("display_name"),
    client.from("projects").select("id,name,customers(full_name)").is("deleted_at",null).order("name"),
  ]);
  if(profilesResult.error) throw profilesResult.error;
  if(projectsResult.error) throw projectsResult.error;
  const profiles=(profilesResult.data??[]).map(item=>({id:item.id,displayName:item.display_name}));
  const projects=(projectsResult.data??[]).map(item=>({id:item.id,name:item.name,customerName:(item.customers as unknown as {full_name:string}|null)?.full_name??"Cliente"}));
  return <TaskCenter currentUserId={auth.user.id} profiles={profiles} projects={projects} tasks={tasks}/>;
}
