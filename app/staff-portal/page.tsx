import { redirect } from "next/navigation";
import { loadPortalSession,StaffPortal } from "@/features/portal-authentication";
export const dynamic="force-dynamic";
export default async function StaffPortalPage(){const session=await loadPortalSession("STAFF");if(!session?.staff_id)redirect("/staff/login");return <StaffPortal staffId={session.staff_id}/>}
