import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { loadNotificationUnreadCount } from "@/features/notification-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInvalidSessionError, isMissingSessionError } from "@/lib/supabase/auth-errors";
import { loadModuleStates, synchronizeModuleCatalog } from "@/features/module-manager/repository";
import { loadFounderWorkspace } from "@/features/founder-workspace";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const client=await createSupabaseServerClient();const{data,error}=await client.auth.getUser();
  if(error){if(isMissingSessionError(error))redirect("/login");if(isInvalidSessionError(error))redirect("/api/auth/session-expired");throw error}
  const user=data.user;if(!user?.email)redirect("/login");
  const{data:profile,error:profileError}=await client.from("profiles").select("role,display_name").eq("id",user.id).maybeSingle();if(profileError)throw profileError;if(!profile||!["CEO","ADMINISTRATOR"].includes(profile.role))redirect(profile?.role==="STAFF"?"/login?access=staff":"/login?access=customer");
  await synchronizeModuleCatalog(client,user.id);
  const [unreadNotifications,modules,workspace]=await Promise.all([loadNotificationUnreadCount(user.id),loadModuleStates(client),loadFounderWorkspace(client,user.id)]);
  return <AppShell modules={modules} unreadNotifications={unreadNotifications} userEmail={user.email} userName={profile.display_name||"Founder"} userRole={profile.role==="CEO"?"Founder":"Administrador"} workspace={workspace}>{children}</AppShell>;
}
