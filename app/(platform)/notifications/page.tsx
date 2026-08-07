import{redirect}from"next/navigation";import{NotificationCenter,loadNotificationInbox}from"@/features/notification-center";import{createSupabaseServerClient}from"@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function NotificationsPage(){const client=await createSupabaseServerClient();const{data,error}=await client.auth.getUser();if(error||!data.user)redirect("/login");await client.rpc("archive_read_notifications");return <NotificationCenter inbox={await loadNotificationInbox(data.user.id)}/>}
