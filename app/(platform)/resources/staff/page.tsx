import { StaffManagement, SupabaseStaffRepository, createStaffManagementSnapshot } from "@/features/resources";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function StaffManagementPage() {
  const repository = new SupabaseStaffRepository(await createSupabaseServerClient());
  const members = await repository.findAll();
  return <StaffManagement snapshot={createStaffManagementSnapshot({ members })} />;
}
