import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PageContainer } from "./page-container";
import { BrandSignature } from "@/components/brand-signature";
import { BrandLogo } from "@/components/brand-logo";

export interface AppShellProps {
  children: React.ReactNode;
  userEmail: string;
  unreadNotifications: number;
}

export function AppShell({ children, userEmail, unreadNotifications }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-20 lg:pl-60">
        <Header unreadNotifications={unreadNotifications} userEmail={userEmail} />
        <main className="min-h-[calc(100vh-4rem)] pb-20 sm:pb-24 md:pb-0">
          <PageContainer>{children}</PageContainer>
        </main>
        <footer className="border-t px-5 py-6 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><BrandLogo className="h-8 w-32" surface="dark" /><BrandSignature className="sm:text-right" /></div></footer>
      </div>
    </div>
  );
}
