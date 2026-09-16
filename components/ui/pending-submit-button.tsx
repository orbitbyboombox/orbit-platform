"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

export type PendingSubmitButtonProps = Omit<ButtonProps, "loading"> & {
  pendingLabel?: string;
};

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel = "Procesando…",
  type = "submit",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      disabled={disabled || pending}
      loading={pending}
      loadingLabel={pendingLabel}
      type={type}
    >
      {children}
    </Button>
  );
}
