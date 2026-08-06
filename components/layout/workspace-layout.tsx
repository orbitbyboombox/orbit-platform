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
      <WorkspaceRegion label="Encabezado del espacio de trabajo">{header}</WorkspaceRegion>

      <div className="grid gap-6 md:gap-8">
        <WorkspaceRegion
          className="min-w-0"
          label="Contenido principal"
        >
          {mainContent}
        </WorkspaceRegion>

        <WorkspaceRegion
          className="min-w-0"
          label="Historial"
        >
          {timeline}
        </WorkspaceRegion>
      </div>

      {copilot ? <FloatingCopilot>{copilot}</FloatingCopilot> : null}

      <WorkspaceRegion label="Acciones del espacio de trabajo">{bottomAction}</WorkspaceRegion>
    </PageContainer>
  );
}
