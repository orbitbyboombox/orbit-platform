import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { loadNotificationUnreadCount } from "@/features/notification-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInvalidSessionError } from "@/lib/supabase/auth-errors";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const client=await createSupabaseServerClient();const{data,error}=await client.auth.getUser();
  if(error){if(isInvalidSessionError(error))redirect("/api/auth/session-expired");throw error}
  const user=data.user;if(!user?.email)redirect("/login");
  const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",user.id).maybeSingle();if(profileError)throw profileError;if(!profile||!["CEO","ADMINISTRATOR"].includes(profile.role))redirect(profile?.role==="STAFF"?"/login?access=staff":"/login?access=customer");
  const unreadNotifications=await loadNotificationUnreadCount(user.id);
  return <AppShell unreadNotifications={unreadNotifications} userEmail={user.email}>{children}</AppShell>;
}
