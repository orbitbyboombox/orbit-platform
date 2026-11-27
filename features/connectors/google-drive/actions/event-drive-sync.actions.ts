"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { synchronizeConfirmedReservationDrive } from "../application/google-drive-sync.service";
import { recoverPendingEventDocuments } from "../application/event-document-recovery.service";

export async function reconcileEventDriveAction(projectId: string) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Sesión requerida.");
    const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
      throw new Error("Solo Founder o Administración puede sincronizar Drive.");
    }
    const eventFolder = await synchronizeConfirmedReservationDrive({ client, projectId, actorId: user.id });
    const result = await recoverPendingEventDocuments({ client, projectId, eventFolder });
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: result.pending === 0,
      message: `Carpeta verificada. Documentos sincronizados: ${result.synced} (${result.reused} reutilizados). Pendientes sin vínculo: ${result.pending - result.linkedPending}.${result.linkedPending ? ` Referencias existentes por revisar: ${result.linkedPending}.` : ""}`,
      failures: result.failures,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible sincronizar Drive." };
  }
}
