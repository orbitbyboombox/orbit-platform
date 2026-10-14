/** Prevent historical booking flows from mutating live customer data in Vercel previews. */
export function bookingWritesBlockedInPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export const bookingPreviewBlockedMessage = "Esta es una vista de recuperación de ORBIT. Las invitaciones, reservas y pagos están desactivados hasta verificar un entorno de pruebas aislado.";
