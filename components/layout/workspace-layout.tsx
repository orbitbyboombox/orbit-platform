import { PageContainer } from "@/components/layout/page-container";
import { SectionTitle } from "@/components/layout/section-title";
import { cn } from "@/lib/utils";

export interface WorkspaceLayoutProps {
  header: React.ReactNode;
  mainContent: React.ReactNode;
  copilot: React.ReactNode;
  timeline: React.ReactNode;
  bottomAction: React.ReactNode;
  className?: string;
}

interface WorkspaceRegionProps {
  children: React.ReactNode;
  label: string;
  className?: string;
}

function WorkspaceRegion({ children, label, className }: WorkspaceRegionProps) {
  return (
    <section aria-label={label} className={className}>
      <SectionTitle className="sr-only" title={label} />
      {children}
    </section>
  );
}

export function WorkspaceLayout({
  header,
  mainContent,
  copilot,
  timeline,
  bottomAction,
  className,
}: WorkspaceLayoutProps) {
  return (
    <PageContainer className={cn("space-y-6 md:space-y-8", className)}>
      <WorkspaceRegion label="Workspace header">{header}</WorkspaceRegion>

      <div className="grid gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <WorkspaceRegion
          className="order-2 min-w-0 md:order-1 lg:row-span-2"
          label="Main content"
        >
          {mainContent}
        </WorkspaceRegion>

        <WorkspaceRegion
          className="order-1 md:hidden lg:order-2 lg:block"
          label="ORBIT Copilot"
        >
          {copilot}
        </WorkspaceRegion>

        <WorkspaceRegion
          className="order-3 min-w-0 lg:order-3"
          label="Timeline"
        >
          {timeline}
        </WorkspaceRegion>
      </div>

      <WorkspaceRegion label="Workspace actions">{bottomAction}</WorkspaceRegion>
    </PageContainer>
  );
}
