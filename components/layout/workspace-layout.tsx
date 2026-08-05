import { PageContainer } from "@/components/layout/page-container";
import { SectionTitle } from "@/components/layout/section-title";
import { cn } from "@/lib/utils";
import { FloatingCopilot } from "@/components/copilot/floating-copilot";

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

      <div className="grid gap-6 md:gap-8">
        <WorkspaceRegion
          className="min-w-0"
          label="Main content"
        >
          {mainContent}
        </WorkspaceRegion>

        <WorkspaceRegion
          className="min-w-0"
          label="Timeline"
        >
          {timeline}
        </WorkspaceRegion>
      </div>

      <FloatingCopilot>{copilot}</FloatingCopilot>

      <WorkspaceRegion label="Workspace actions">{bottomAction}</WorkspaceRegion>
    </PageContainer>
  );
}
