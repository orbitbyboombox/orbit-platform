import { notFound } from "next/navigation";
import { StaffOnboardingForm } from "@/features/staff-onboarding/staff-onboarding-form";
import { loadStaffOnboarding } from "@/features/staff-onboarding/staff-onboarding.service";

export default async function StaffOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await loadStaffOnboarding(token);
  if (!invitation) notFound();
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <StaffOnboardingForm invitation={invitation} token={token} />
    </main>
  );
}
