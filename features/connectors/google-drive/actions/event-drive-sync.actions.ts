"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { synchronizeConfirmedReservationDrive } from "../application/google-drive-sync.service";
import { retryPhotoStripDriveAction } from "@/features/photo-strip-design/actions";

export async function reconcileEventDriveAction(projectId: string) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Sesión requerida.");
    const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
      throw new Error("Solo Founder o Administración puede sincronizar Drive.");
    }
    await synchronizeConfirmedReservationDrive({ client, projectId, actorId: user.id });
    const { data: pending, error } = await client.from("documents")
      .select("id,document_type,drive_sync_status")
      .eq("project_id", projectId).is("deleted_at", null)
      .not("storage_path", "is", null);
    if (error) throw error;
    let retried = 0;
    let unresolved = 0;
    for (const document of pending ?? []) {
      if (document.drive_sync_status === "SYNCED") continue;
      if (document.document_type !== "PHOTO_STRIP_DESIGN") {
        unresolved += 1;
        continue;
      }
      const result = await retryPhotoStripDriveAction(projectId, document.id);
      if (result.ok) retried += 1;
      else unresolved += 1;
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: unresolved === 0, message: `Carpeta verificada. Diseños sincronizados: ${retried}. Documentos pendientes: ${unresolved}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No fue posible sincronizar Drive." };
  }
}
