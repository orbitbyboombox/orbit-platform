import { redirect } from "next/navigation";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadAcademyArticles,
  loadStaffAcademyProgress,
} from "@/features/academy/repository";
import { StaffAcademy } from "@/features/academy/staff-academy";
export const dynamic = "force-dynamic";
export default async function StaffAcademyPage() {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) redirect("/staff/login");
  const client = createAdminClient(),
    [articles, state] = await Promise.all([
      loadAcademyArticles(client, { staff: true }),
      loadStaffAcademyProgress(client, session.staff_id),
    ]);
  return (
    <StaffAcademy
      articles={articles}
      completedItems={state.completedItems}
      progress={state.progress}
    />
  );
}
