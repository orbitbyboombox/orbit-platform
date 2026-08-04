import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PageContainer } from "./page-container";

export interface AppShellProps {
  children: React.ReactNode;
  userEmail: string;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-20 lg:pl-60">
        <Header userEmail={userEmail} />
        <main className="min-h-[calc(100vh-4rem)]">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
