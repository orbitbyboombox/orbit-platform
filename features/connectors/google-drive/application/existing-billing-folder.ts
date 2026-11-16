import type { GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";

export async function resolveExistingBillingFolder(input: {
  provider: Pick<GoogleDriveLiveProvider, "getFolderParents" | "findFolder">;
  eventFolderId: string;
  storedFolderId?: string;
}): Promise<string> {
  const getParents = input.provider.getFolderParents;
  if (!getParents) throw new Error("No se puede verificar la carpeta de Google Drive.");
  // Verify the event independently of obsolete year/month mappings. Never move it.
  await getParents.call(input.provider, input.eventFolderId);
  if (input.storedFolderId) {
    try {
      const parents = await getParents.call(input.provider, input.storedFolderId);
      if (parents.includes(input.eventFolderId)) return input.storedFolderId;
    } catch (error) {
      // A 404 is not proof of deletion. Search only inside the verified event.
      if (!(error instanceof Error) || !/\(404\)/.test(error.message)) throw error;
    }
  }
  const folder = await input.provider.findFolder({ name: "07_Facturación", parentFolderId: input.eventFolderId });
  if (!folder) throw new Error("No se encontró 07_Facturación dentro de la carpeta del evento. Revisa el vínculo y los permisos; no se creó ninguna carpeta.");
  const parents = await getParents.call(input.provider, folder.id);
  if (!parents.includes(input.eventFolderId)) throw new Error("La carpeta de facturación no pertenece al evento.");
  return folder.id;
}
