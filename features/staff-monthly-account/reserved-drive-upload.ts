export async function completeReservedDriveUpload(
  id: string,
  verify: (id: string) => Promise<boolean>,
  upload: (id: string) => Promise<void>,
) {
  if (await verify(id)) return "RECONCILED";
  try {
    await upload(id);
  } catch (error) {
    if (await verify(id)) return "RECONCILED";
    throw error;
  }
  if (!(await verify(id))) throw new Error("El archivo reservado aún no se puede verificar en Drive.");
  return "UPLOADED";
}
