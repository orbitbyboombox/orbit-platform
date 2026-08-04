import { ModulePage } from "@/components/layout/module-page";
import { modules } from "@/lib/modules";

export default function DashboardPage() {
  return <ModulePage {...modules.Dashboard} />;
}
