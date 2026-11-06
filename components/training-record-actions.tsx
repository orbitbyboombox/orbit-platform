"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeStaffTraining } from "@/app/staff/capacitaciones/actions";

export function TrainingRecordActions({ id, status }: { id: string; status: "PLANNED" | "COMPLETED" | "CANCELLED" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (status !== "PLANNED") return null;
  return <button type="button" className="rounded border px-3 py-1 text-xs font-semibold disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => {
    const result = await completeStaffTraining(id);
    if (!result.ok) window.alert(result.message);
    else router.refresh();
  })}>{pending ? "Completando…" : "Marcar completada"}</button>;
}
