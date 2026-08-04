import { Clock3, Sparkles } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { ActionButton } from "@/components/ui/action-button";

export interface OrbitCopilotProps {
  title?: string;
  recommendation: string;
  estimatedTime: string;
  actionLabel: string;
  onAction?: () => void;
  recommendationLabel?: string;
  estimatedTimeLabel?: string;
  ariaLabel?: string;
  reason?: string;
  impact?: string;
  reasonLabel?: string;
  impactLabel?: string;
}

export function OrbitCopilot({
  title = "Recomendación de hoy",
  recommendation,
  estimatedTime,
  actionLabel,
  onAction,
  recommendationLabel = "Recomendación",
  estimatedTimeLabel = "Tiempo estimado",
  ariaLabel = "Recomendación de ORBIT Copilot",
  reason,
  impact,
  reasonLabel = "Motivo",
  impactLabel = "Impacto",
}: OrbitCopilotProps) {
  return (
    <SmartCard
      aria-label={ariaLabel}
      className="relative overflow-hidden border-brand/20 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.08)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand before:to-transparent sm:p-8"
    >
      <div className="flex flex-col gap-6 sm:gap-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand"><Sparkles aria-hidden="true" className="size-4" />ORBIT Copilot</p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        </div>

        <div className="border-l-2 border-brand pl-4 sm:pl-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{recommendationLabel}</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{recommendation}</p>
        </div>

        {(reason || impact) && <dl className="grid gap-3 sm:grid-cols-2">{reason && <div className="rounded-xl bg-accent/65 p-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{reasonLabel}</dt><dd className="mt-2 text-sm leading-6">{reason}</dd></div>}{impact && <div className="rounded-xl bg-accent/65 p-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{impactLabel}</dt><dd className="mt-2 text-sm leading-6">{impact}</dd></div>}</dl>}

        <div className="flex flex-col gap-5 border-t pt-5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Clock3 aria-hidden="true" className="size-4 shrink-0" />
            <span>{estimatedTimeLabel}</span>
            <span className="font-medium text-foreground">{estimatedTime}</span>
          </div>

          <ActionButton
            className="w-full"
            label={actionLabel}
            onClick={onAction}
            type="button"
          />
        </div>
      </div>
    </SmartCard>
  );
}
