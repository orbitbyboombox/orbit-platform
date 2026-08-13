export const ACADEMY_TYPES = [
  { value: "MANUAL", label: "Manuales" },
  { value: "VIDEO", label: "Videos" },
  { value: "CHECKLIST", label: "Checklists operacionales" },
  { value: "PROTOCOL", label: "Protocolos operacionales" },
  { value: "FAQ", label: "Preguntas frecuentes" },
  { value: "DOWNLOAD", label: "Descargas" },
  { value: "ANNOUNCEMENT", label: "Anuncios" },
] as const;
export type AcademyType = (typeof ACADEMY_TYPES)[number]["value"];
export type AcademyArticle = {
  id: string;
  type: AcademyType;
  category: string;
  status: string;
  currentVersion: number;
  publishedAt: string | null;
  versionId: string;
  versionLabel: string;
  title: string;
  description: string;
  body: string;
  keywords: string[];
  fileName: string | null;
  filePath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  thumbnailPath: string | null;
  publishedOn: string | null;
  items: Array<{ id: string; position: number; label: string }>;
  versions: Array<{
    id: string;
    versionNumber: number;
    versionLabel: string;
    publishedOn: string | null;
    createdAt: string;
  }>;
};
export type AcademyProgress = {
  staffId: string;
  articleId: string;
  versionId: string;
  viewedAt: string | null;
  completedAt: string | null;
  watchedSeconds: number;
  lastAccessedAt: string;
};
export type AcademyStaffStat = {
  id: string;
  name: string;
  manualsRead: number;
  videosWatched: number;
  lastAccess: string | null;
  completion: number;
};
