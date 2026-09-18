import { FinanceTabs } from "@/features/finance/components/finance-tabs";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5"><FinanceTabs />{children}</div>;
}
