import "server-only";

import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerDocumentCategory =
  | "CONTRACTS"
  | "FINANCIAL"
  | "DESIGN"
  | "PHOTOS"
  | "VIDEOS"
  | "OTHER";

export interface CustomerDriveDocument {
  id: string;
  name: string;
  category: CustomerDocumentCategory;
  categoryLabel: string;
  mimeType: string;
  createdTime: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  folderId: string;
  folderUrl: string;
  storageBucket?: string | null;
  storagePath?: string | null;
}

export interface CustomerDocuments {
  status: "AVAILABLE" | "COMING_SOON" | "ERROR";
  files: CustomerDriveDocument[];
  rootFolderUrl: string | null;
}

const folderDefinitions = [
  { suffix: "/01_Contrato", category: "CONTRACTS", label: "Contrato" },
  { suffix: "/02_Comprobantes", category: "FINANCIAL", label: "Comprobante de pago" },
  { suffix: "/03_Cotizaciones", category: "FINANCIAL", label: "Cotización" },
  { suffix: "/04_Diseños", category: "DESIGN", label: "Diseño" },
  { suffix: "/05_Fotografías", category: "PHOTOS", label: "Fotografía" },
  { suffix: "/06_Videos", category: "VIDEOS", label: "Video" },
  { suffix: "/07_Facturación", category: "FINANCIAL", label: "Factura" },
  { suffix: "/08_Honorarios", category: "FINANCIAL", label: "Honorarios" },
  { suffix: "/09_Documentos", category: "OTHER", label: "Otro documento" },
] as const satisfies ReadonlyArray<{
  suffix: string;
  category: CustomerDocumentCategory;
  label: string;
}>;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function loadCustomerDocuments(projectId: string): Promise<CustomerDocuments> {
  try {
    const admin = createAdminClient();
    const { data: folders, error } = await admin
      .from("drive_sync")
      .select("destination_key,external_folder_id")
      .eq("project_id", projectId)
      .not("external_folder_id", "is", null);
    if (error) throw error;
    const { data: storedDocuments, error: storedError } = await admin
      .from("documents")
      .select("id,document_type,original_filename,mime_type,created_at,updated_at,version,is_current,storage_bucket,storage_path,deleted_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .or("document_type.neq.PHOTO_STRIP_DESIGN,is_current.eq.true");
    if (storedError) throw storedError;

    const configuredFolders = folderDefinitions.flatMap((definition) => {
      const folder = folders?.find((item) => item.destination_key.endsWith(definition.suffix));
      return folder?.external_folder_id ? [{ ...definition, id: folder.external_folder_id }] : [];
    });
    const storageFiles: CustomerDriveDocument[] = (storedDocuments ?? []).filter((item) => item.storage_bucket && item.storage_path).map((item) => ({
      id: item.id,
      name: item.original_filename || item.document_type.replaceAll("_", " "),
      category: item.document_type.includes("DESIGN") ? "DESIGN" : item.document_type.includes("PHOTO") ? "PHOTOS" : item.document_type === "EXTERNAL_TAX_DOCUMENT" || item.document_type.includes("PAYMENT") ? "FINANCIAL" : item.document_type.includes("AGREEMENT") || item.document_type.includes("CONTRACT") ? "CONTRACTS" : "OTHER",
      categoryLabel: item.document_type.replaceAll("_", " "),
      mimeType: item.mime_type || "application/octet-stream",
      createdTime: item.created_at,
      modifiedTime: item.updated_at ?? item.created_at,
      webViewLink: null,
      folderId: "",
      folderUrl: "",
      storageBucket: item.storage_bucket,
      storagePath: item.storage_path,
    }));
    if (configuredFolders.length === 0) return storageFiles.length ? { status: "AVAILABLE", files: storageFiles, rootFolderUrl: null } : empty("COMING_SOON");

    const token = await loadGoogleWorkspaceAccessToken();
    const folderFiles = await Promise.all(
      configuredFolders.map(async (folder) => ({ folder, files: await listFiles(token, folder.id) })),
    );
    const files = folderFiles.flatMap(({ folder, files: entries }) =>
      entries
        .filter((entry) => entry.mimeType !== "application/vnd.google-apps.folder")
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          category: folder.category,
          categoryLabel: folder.label,
          mimeType: entry.mimeType,
          createdTime: entry.createdTime ?? null,
          modifiedTime: entry.modifiedTime ?? null,
          webViewLink: entry.webViewLink ?? null,
          folderId: folder.id,
          folderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
        })),
    );

    const eventFolder = folders
      ?.filter((item) => folderDefinitions.some((definition) => item.destination_key.endsWith(definition.suffix)))
      .map((item) => item.destination_key.slice(0, item.destination_key.lastIndexOf("/")))
      .find(Boolean);
    const rootFolderId = folders?.find((item) => item.destination_key === eventFolder)?.external_folder_id;

    const merged = [...storageFiles, ...files.filter((file) => !storageFiles.some((stored) => stored.id === file.id))];
    return {
      status: merged.length > 0 ? "AVAILABLE" : "COMING_SOON",
      files: merged,
      rootFolderUrl: rootFolderId ? `https://drive.google.com/drive/folders/${rootFolderId}` : null,
    };
  } catch {
    return empty("ERROR");
  }
}

function empty(status: "COMING_SOON" | "ERROR"): CustomerDocuments {
  return { status, files: [], rootFolderUrl: null };
}

async function listFiles(token: string, parentId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("orderBy", "modifiedTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Drive document lookup failed (${response.status})`);
    const body = (await response.json()) as { nextPageToken?: string; files?: DriveFile[] };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files;
}
