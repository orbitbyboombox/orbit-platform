import { Sparkles } from "lucide-react";
import { SmartCard, type SmartCardProps } from "@/components/cards/smart-card";

export interface CopilotCardProps extends Omit<SmartCardProps, "icon"> {
  eyebrow?: string;
}

export function CopilotCard({ eyebrow = "ORBIT Copilot", title, description, children, ...props }: CopilotCardProps) {
  return <SmartCard icon={<Sparkles aria-hidden="true" className="size-4" />} {...props}><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>{title && <h3 className="font-medium">{title}</h3>}{description && <p className="mt-1 text-sm text-muted">{description}</p>}{children && <div className="mt-4">{children}</div>}</SmartCard>;
}
