import { createHash, randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createRefreshingDriveTransport, createTributaryDriveArchive } from "@/features/finance/tributary-drive-archive";

const route = "/finance/tributary/drive-verification";

function syntheticPdf() {
  const parts = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = parts.map((part, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${part}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += "xref\n0 4\n0000000000 65535 f \n" + offsets.map(n => `${String(n).padStart(10,"0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

async function verifyDrive() {
  "use server";
  if (!await getGoogleWorkspaceAdministrator()) notFound();
  const fixtures: string[] = [];
  let status = "workspace";
  let conflicts = 0;
  let transport: typeof fetch | undefined;
  try {
    const token = await loadGoogleWorkspaceAccessToken();
    const measuredFetch: typeof fetch = async (input, init) => {
      const result = await fetch(input, init);
      if (result.status === 409) conflicts++;
      return result;
    };
    transport = createRefreshingDriveTransport(token, loadGoogleWorkspaceAccessToken, measuredFetch);
    const archive = createTributaryDriveArchive(token, transport);
    status = "destination";
    // Use a known existing period. No accounting rows or folders are created.
    const csvFolder = await archive.resolveFolder("2026-11-01", "Compras", "CSV");
    const pdfFolder = await archive.resolveFolder("2026-11-01", "FACTURA", "PDF");
    const suffix = randomUUID();
    status = "upload";
    const csv = Buffer.from("origen;estado\r\nORBIT_QA_SINTETICO;PRUEBA\r\n");
    const pdf = syntheticPdf();
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    const csvId = await archive.reserveId("files");
    fixtures.push(csvId);
    const csvInput = { id: csvId, parentId: csvFolder, name: `ORBIT-QA-${suffix}.csv`, bytes: csv, checksum: digest(csv) };
    await archive.archiveCsv(csvInput);
    const pdfId = await archive.reserveId("files");
    fixtures.push(pdfId);
    await archive.archiveCsv({ id: pdfId, parentId: pdfFolder, name: `ORBIT-QA-${suffix}.pdf`, bytes: pdf, checksum: digest(pdf), mimeType: "application/pdf" });
    const shortcutId = await archive.reserveId();
    fixtures.push(shortcutId);
    const shortcut = { id: shortcutId, parentId: pdfFolder, name: `ORBIT-QA-${suffix}-vinculo.pdf`, targetId: pdfId };
    await archive.archiveShortcut(shortcut);

    status = "replay";
    await archive.archiveCsv(csvInput);
    await archive.archiveShortcut(shortcut);
    if (conflicts !== 2) throw new Error("Drive no confirmó ambos reintentos.");
    status = "passed";
  } catch (error) {
    // Distinguish destination resolution without publishing provider responses.
    if (status === "destination" && error instanceof Error) {
      const http = /^Drive respondió HTTP (401|403|404|429|500|503)\.$/.exec(error.message)?.[1];
      if (http) status = `drive-${http}`;
      else if (error.message.startsWith("Destino existente ausente o ambiguo:")) status = "folder";
      else if (error.message === "La carpeta oficial FINANZAS SII no está disponible.") status = "root";
    }
  } finally {
    if (transport) {
      const cleanup = await Promise.allSettled(fixtures.map(async id => {
        const result = await transport!(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"trashed":true}', signal: AbortSignal.timeout(10000),
        });
        if (!result.ok && result.status !== 404) throw new Error("No se pudo retirar la prueba.");
      }));
      if (cleanup.some(result => result.status === "rejected")) status = "cleanup";
    }
  }
  redirect(`${route}?resultado=${status}`);
}

const messages: Record<string, string> = {
  passed: "Prueba aprobada: CSV y PDF íntegros en FINANZAS SII, dos reintentos con los mismos IDs y archivos retirados a la papelera.",
  workspace: "ORBIT no pudo obtener un token de la conexión Workspace activa.",
  destination: "ORBIT no pudo resolver y verificar las carpetas existentes de noviembre.",
  "drive-401": "Google Drive rechazó el token devuelto a ORBIT (HTTP 401).",
  "drive-403": "Google Drive denegó acceso a la identidad conectada de ORBIT (HTTP 403).",
  "drive-404": "Google Drive no hizo visible el destino a la identidad conectada de ORBIT (HTTP 404).",
  "drive-429": "Google Drive limitó temporalmente la solicitud (HTTP 429).",
  "drive-500": "Google Drive no pudo completar la consulta (HTTP 500).",
  "drive-503": "Google Drive no estuvo disponible (HTTP 503).",
  folder: "El destino anual, mensual o de tipo documental está ausente o es ambiguo para ORBIT.",
  root: "El destino de Drive no coincide con la raíz FINANZAS SII verificada.",
  upload: "Drive no confirmó el destino o la huella de uno de los archivos sintéticos.",
  replay: "Drive no confirmó los dos reintentos idempotentes.",
  cleanup: "La prueba requiere revisar la retirada de sus archivos sintéticos.",
};

export default async function DriveVerificationPage({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  if (!await getGoogleWorkspaceAdministrator()) notFound();
  const { resultado } = await searchParams;
  return <main className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-card p-5">
    <h1 className="text-xl font-semibold">Verificación aislada de Drive tributario</h1>
    <p className="text-sm text-muted">Usa la conexión existente de ORBIT y dos archivos sintéticos. La prueba retira sus archivos al terminar.</p>
    {resultado && messages[resultado] && <p role="status">{messages[resultado]}</p>}
    <form action={verifyDrive}>
      <button type="submit" className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Comprobar archivo aislado</button>
    </form>
  </main>;
}
