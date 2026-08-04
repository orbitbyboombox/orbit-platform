import { Clock3, Sparkles } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";

export interface OrbitCopilotProps {
  title?: string;
  recommendation: string;
  estimatedTime: string;
  actionLabel: string;
  onAction?: () => void;
}

export function OrbitCopilot({
  title = "Today's Recommendation",
  recommendation,
  estimatedTime,
  actionLabel,
  onAction,
}: OrbitCopilotProps) {
  return (
    <SmartCard
      aria-label="ORBIT Copilot recommendation"
      className="p-6 sm:p-8"
      icon={<Sparkles aria-hidden="true" className="size-4" />}
    >
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            ORBIT Copilot
          </p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        </div>

        <div className="border-l-2 border-accent-foreground/30 pl-4 sm:pl-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Recommendation</p>
          <p className="mt-2 text-base font-medium sm:text-lg">{recommendation}</p>
        </div>

        <div className="flex flex-col gap-5 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Clock3 aria-hidden="true" className="size-4 shrink-0" />
            <span>Estimated time</span>
            <span className="font-medium text-foreground">{estimatedTime}</span>
          </div>

          <ActionButton
            className="w-full sm:w-auto"
            label={actionLabel}
            onClick={onAction}
            type="button"
          />
        </div>
      </div>
    </SmartCard>
  );
}
