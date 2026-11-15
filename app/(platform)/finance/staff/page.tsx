import StaffManagementPage from "@/app/(platform)/resources/staff/page";

/** Reuse the canonical Staff payroll workspace and its Founder/Admin actions. */
export default function FinanceStaffPage({ searchParams }: { searchParams: Promise<{ reviewAccount?: string }> }) {
  return StaffManagementPage({ searchParams: searchParams.then(({ reviewAccount }) => ({ view: "payroll", reviewAccount })) });
}
