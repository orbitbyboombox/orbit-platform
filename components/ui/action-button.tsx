import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "./button";

export interface ActionButtonProps extends ButtonProps {
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  label: string;
}

export function ActionButton({ icon: Icon, iconPosition = "start", label, ...props }: ActionButtonProps) {
  return <Button {...props}>{Icon && iconPosition === "start" && <Icon aria-hidden="true" className="size-4" />}<span>{label}</span>{Icon && iconPosition === "end" && <Icon aria-hidden="true" className="size-4" />}</Button>;
}
