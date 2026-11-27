const ARCHIVE_ROOT = "1ptC-FNBe5rbsMB9SDgmdSbCJs6AsRvdc";
const DIRECTORY = "application/vnd.google-apps.folder";
const SHORTCUT = "application/vnd.google-apps.shortcut";
const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const categories: Record<string, string> = {
  Compras: "06_REGISTRO_COMPRAS",
  Ventas: "07_REGISTRO_VENTAS",
  FACTURA: "01_FACTURAS",
  BOLETA: "02_BOLETAS",
  GUIA_DESPACHO: "03_GUIAS_DE_DESPACHO",
  NOTA_CREDITO: "04_NOTAS_DE_CREDITO",
  NOTA_DEBITO: "05_NOTAS_DE_DEBITO",
};
const allowedId = /^[A-Za-z0-9_-]+$/;

type DriveFile = { id: string; name?: string; mimeType?: string; trashed?: boolean; parents?: string[]; sha256Checksum?: string; shortcutDetails?: { targetId: string } };

export function resolveTributaryArchivePath(issueDate: string, type: string, kind: "PDF" | "XML" | "ACUSE" | "CSV") {
  const date = /^([1-9]\d{3})-(0[1-9]|1[0-2])-\d{2}$/.exec(issueDate);
  const category = kind === "ACUSE" ? "08_RESPALDOS_Y_ACUSES_SII" : categories[type];
  if (!date || !category) throw new Error("Período o tipo documental no reconocido.");
  return [date[1], `${date[2]}_${MONTHS[Number(date[2]) - 1]}`, category];
}

export function createTributaryDriveArchive(token: string, transport: typeof fetch = fetch) {
  async function request<T>(path: string, query: Record<string, string>, body?: object) {
    const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await transport(url, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      ...(body && { method: "POST", body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Drive respondió HTTP ${response.status}.`);
    return await response.json() as T;
  }

  return {
    async resolveFolder(issueDate: string, type: string, kind: "PDF" | "XML" | "ACUSE" | "CSV") {
      const root = await request<DriveFile>(`files/${ARCHIVE_ROOT}`, { fields: "id,name,mimeType,trashed", supportsAllDrives: "true" });
      if (root.id !== ARCHIVE_ROOT || root.name !== "FINANZAS SII" || root.mimeType !== DIRECTORY || root.trashed) {
        throw new Error("La carpeta oficial FINANZAS SII no está disponible.");
      }
      let parent = root.id;
      for (const name of resolveTributaryArchivePath(issueDate, type, kind)) {
        const result = await request<{ files: DriveFile[]; nextPageToken?: string }>("files", {
          q: `'${parent}' in parents and name = '${name}' and mimeType = '${DIRECTORY}' and trashed = false`,
          fields: "nextPageToken,files(id)", pageSize: "2", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
        });
        if (result.files.length !== 1 || result.nextPageToken || !allowedId.test(result.files[0].id)) {
          throw new Error(`Destino existente ausente o ambiguo: ${name}.`);
        }
        parent = result.files[0].id;
      }
      return parent;
    },
    async reserveId(type: "shortcuts" | "files" = "shortcuts") {
      const result = await request<{ ids: string[] }>("files/generateIds", { count: "1", space: "drive", type });
      const id = result.ids[0];
      if (!id || !allowedId.test(id)) throw new Error("Drive no entregó un identificador válido.");
      return id;
    },
    async archiveCsv(input: { id: string; parentId: string; name: string; bytes: Uint8Array; checksum: string }) {
      if (![input.id, input.parentId].every(id => allowedId.test(id))) throw new Error("Identificador de Drive inválido.");
      const fields = "id,name,mimeType,trashed,parents,sha256Checksum";
      const query = { fields, supportsAllDrives: "true" };
      const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
      url.search = new URLSearchParams({ ...query, uploadType: "multipart" }).toString();
      const boundary = `orbit-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ id: input.id, parents: [input.parentId], name: input.name, mimeType: "text/csv" });
      const response = await transport(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
          `--${boundary}\r\nContent-Type: text/csv\r\n\r\n`, Uint8Array.from(input.bytes),
          `\r\n--${boundary}--\r\n`,
        ]),
        signal: AbortSignal.timeout(10000),
      });
      const file = response.status === 409 ? await request<DriveFile>(`files/${input.id}`, query)
        : response.ok ? await response.json() as DriveFile : null;
      if (!file || file.id !== input.id || file.trashed || file.mimeType !== "text/csv" || file.name !== input.name
        || file.parents?.length !== 1 || file.parents[0] !== input.parentId || file.sha256Checksum !== input.checksum) {
        throw new Error("No se pudo comprobar el respaldo CSV en Drive.");
      }
      return file.id;
    },
    async archiveShortcut(input: { id: string; parentId: string; targetId: string; name: string }) {
      if (![input.id, input.parentId, input.targetId].every(id => allowedId.test(id))) throw new Error("Identificador de Drive inválido.");
      const fields = "id,mimeType,trashed,parents,shortcutDetails(targetId)";
      const query = { fields, supportsAllDrives: "true" };
      let file: DriveFile;
      try {
        file = await request<DriveFile>("files", query, {
          id: input.id, name: input.name, mimeType: SHORTCUT, parents: [input.parentId], shortcutDetails: { targetId: input.targetId },
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Drive respondió HTTP 409.") throw error;
        file = await request<DriveFile>(`files/${input.id}`, query);
      }
      if (file.id !== input.id || file.mimeType !== SHORTCUT || file.trashed
        || file.parents?.length !== 1 || file.parents[0] !== input.parentId
        || file.shortcutDetails?.targetId !== input.targetId) {
        throw new Error("El vínculo almacenado en Drive no coincide con el documento y destino esperados.");
      }
      return file.id;
    },
  };
}
