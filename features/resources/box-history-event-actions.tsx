"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeBlackBoxFromEventAction } from "@/features/asset-management/event-black-box.actions";
import { AdminPaperCloseoutDialog } from "./admin-paper-closeout-dialog";

type Props = { projectId: string; assignmentId: string; eventName: string; boxCode: string };

export function BoxHistoryEventActions({ projectId, assignmentId, eventName, boxCode }: Props) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const refresh = () => window.location.reload();

  return <div className="mt-4 flex min-w-0 flex-wrap gap-2 border-t pt-4">
    <Link href={`/projects/${projectId}#equipment-assignment`} className="inline-flex min-h-10 max-w-full items-center justify-center rounded-lg border px-3 text-xs font-semibold">Ver evento</Link>
    <AdminPaperCloseoutDialog projectId={projectId} assignmentId={assignmentId} eventName={eventName} boxCode={boxCode} onDone={refresh} />
    <button type="button" className="inline-flex min-h-10 max-w-full items-center justify-center rounded-lg border border-red-500/30 px-3 text-xs font-semibold text-red-600 disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => { const result = await removeBlackBoxFromEventAction({ projectId, reason: `Liberación desde historial · ${boxCode}` }); if (!result.ok) { setMessage(result.error ?? "No fue posible liberar la Caja."); return; } refresh(); })}>Liberar</button>
    {message ? <p role="alert" className="basis-full text-xs text-red-600">{message}</p> : null}
  </div>;
}
