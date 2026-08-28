import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PageContainer } from "./page-container";
import { BrandSignature } from "@/components/brand-signature";
import { BrandLogo } from "@/components/brand-logo";
import { ModuleAvailabilityGuard, ModuleManagerProvider } from "@/features/module-manager";
import type { ModuleStateMap } from "@/features/module-manager/repository";
import type { FounderWorkspacePreferences } from "@/features/founder-workspace";
import { GlobalLayoutEngine, PersonalWorkspaceProvider } from "@/features/founder-workspace/personal-workspace";

export interface AppShellProps {
  children: React.ReactNode;
  userEmail: string;
  userName: string;
  userRole: string;
  actionableNotifications: number;
  modules: ModuleStateMap;
  workspace: FounderWorkspacePreferences;
}

export function AppShell({ children, userEmail, userName, userRole, actionableNotifications, modules, workspace }: AppShellProps) {
  return (
    <ModuleManagerProvider modules={modules}><PersonalWorkspaceProvider initialPreferences={workspace}><div className="min-h-screen bg-background">
      <Sidebar hiddenNavigation={workspace.hiddenNavigation} navigationOrder={workspace.navigationOrder} />
      <div className="transition-[padding] duration-200 md:pl-20 lg:pl-[15.25rem] peer-data-[collapsed=true]:lg:pl-20">
        <Header actionableNotifications={actionableNotifications} hiddenNavigation={workspace.hiddenNavigation} navigationOrder={workspace.navigationOrder} userEmail={userEmail} userName={userName} userRole={userRole} />
        <main className="min-h-[calc(100vh-4rem)] pb-20 sm:pb-24 md:pb-0">
          <PageContainer id="platform-workspace-content"><GlobalLayoutEngine/><ModuleAvailabilityGuard>{children}</ModuleAvailabilityGuard></PageContainer>
        </main>
        <footer className="px-5 py-5 sm:px-8"><div className="mx-auto flex max-w-[1600px] flex-col gap-2 border-t border-border/60 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between"><BrandLogo className="h-6 w-24 opacity-80" surface="dark" /><BrandSignature className="sm:text-right" /></div></footer>
      </div>
    </div></PersonalWorkspaceProvider></ModuleManagerProvider>
  );
}
