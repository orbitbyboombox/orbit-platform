export type StaffEventExtra = { key: string; label: string; enabled: boolean };

const EXTRA_LABELS: Record<string, string> = {
  imanes: "IMANES", magnets: "IMANES",
  libro: "LIBRO DE FIRMAS", libro_firmas: "LIBRO DE FIRMAS", guestbook: "LIBRO DE FIRMAS",
  qr: "QR DIGITAL", qr_digital: "QR DIGITAL",
  fotos_online: "FOTOS ONLINE", galeria: "FOTOS ONLINE",
};

export function getStaffEventReminders(extras: StaffEventExtra[]): string[] {
  const labels = extras
    .filter((extra) => extra.enabled === true)
    .map((extra) => EXTRA_LABELS[extra.key.toLowerCase().trim()] ?? extra.label.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(labels)];
}
