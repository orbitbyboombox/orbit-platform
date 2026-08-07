import { StaffManagement, SupabaseStaffRepository, createStaffManagementSnapshot } from "@/features/resources";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StaffPinReset } from "@/features/portal-authentication";

export default async function StaffManagementPage() {
  const repository = new SupabaseStaffRepository(await createSupabaseServerClient());
  const members = await repository.findAll();
  return <div className="space-y-6"><StaffPinReset members={members.map(member=>({id:member.profile.id,name:`${member.profile.firstName} ${member.profile.lastName}`}))}/><StaffManagement snapshot={createStaffManagementSnapshot({ members })} /></div>;
}
