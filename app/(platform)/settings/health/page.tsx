import { redirect } from "next/navigation";
import { SystemHealthCenter, loadSystemHealth } from "@/features/system-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function SystemHealthPage(){
  const client=await createSupabaseServerClient();
  const{data,error}=await client.auth.getUser();
  if(error||!data.user)redirect("/login");
  const snapshot=await loadSystemHealth(data.user.id);
  return <SystemHealthCenter snapshot={snapshot}/>;
}
