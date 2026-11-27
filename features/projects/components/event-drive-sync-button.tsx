"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reconcileEventDriveAction } from "@/features/connectors/google-drive/actions/event-drive-sync.actions";

export function EventDriveSyncButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; failures?: Array<{ documentId: string; type: string; reason: string }> }>();
  return <div className="space-y-2">
    <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      try {
        setFeedback(await reconcileEventDriveAction(projectId));
      } catch {
        setFeedback({ ok: false, message: "No se pudo verificar el resultado de la sincronización." });
      }
    })}>{pending ? "Revisando Drive…" : "Sincronizar Drive"}</Button>
    {feedback && <div role={feedback.ok ? "status" : "alert"} className="text-sm">
      <p>{feedback.message}</p>
      {Boolean(feedback.failures?.length) && <ul className="list-disc space-y-1 pl-5">
        {feedback.failures?.map(failure => <li key={failure.documentId}>{failure.type} · {failure.documentId}. {failure.reason}</li>)}
      </ul>}
    </div>}
  </div>;
}
