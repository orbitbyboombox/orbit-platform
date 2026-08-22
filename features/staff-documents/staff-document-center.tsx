"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import {
  staffDocumentCategoryMeta,
  type StaffDocumentCategory,
  type StaffDocumentView,
} from "./staff-document-model";

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`El servidor respondió con un error (${response.status}).`);
  }
}

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

export function StaffDocumentCenter({
  staffId,
  staffName,
  initialDocuments,
}: {
  staffId: string;
  staffName: string;
  initialDocuments: StaffDocumentView[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [category, setCategory] = useState<StaffDocumentCategory>("IDENTIDAD");
  const [applicableMonth, setApplicableMonth] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const periodic = staffDocumentCategoryMeta.find(
    (item) => item.category === category,
  )?.periodic;
  const grouped = useMemo(
    () =>
      staffDocumentCategoryMeta.map((meta) => ({
        ...meta,
        documents: documents
          .filter((item) => item.category === meta.category)
          .sort((a, b) => {
            const byMonth = (b.applicableMonth ?? "").localeCompare(
              a.applicableMonth ?? "",
            );
            return byMonth || b.createdAt.localeCompare(a.createdAt);
          }),
      })),
    [documents],
  );

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return setMessage("Selecciona un archivo.");
    setPending(true);
    setProgress(10);
    setMessage("");
    let path = "";
    try {
      const basePayload = {
        category,
        applicableMonth: periodic ? applicableMonth : null,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        label,
      };
      const authorization = await fetch(`/api/staff-documents/${staffId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "AUTHORIZE", ...basePayload }),
      });
      const authorized = await readJson(authorization);
      if (!authorization.ok)
        throw new Error(String(authorized.message ?? "No fue posible iniciar la carga."));
      path = String(authorized.path ?? "");
      const signedUrl = String(authorized.signedUrl ?? "");
      const documentId = String(authorized.documentId ?? "");
      if (!path || !signedUrl || !documentId)
        throw new Error("No fue posible iniciar la carga.");
      setProgress(35);
      const storageResponse = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!storageResponse.ok)
        throw new Error(`Storage rechazó el archivo (${storageResponse.status}).`);
      setProgress(80);
      const completion = await fetch(`/api/staff-documents/${staffId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COMPLETE",
          ...basePayload,
          documentId,
          path,
        }),
      });
      const completed = await readJson(completion);
      if (!completion.ok)
        throw new Error(String(completed.message ?? "No fue posible registrar el documento."));
      const document = completed.document as StaffDocumentView | undefined;
      if (!document) throw new Error("El documento no quedó disponible.");
      setDocuments((current) => [document, ...current]);
      setProgress(100);
      setMessage("Documento protegido y disponible en el perfil.");
      setLabel("");
      setApplicableMonth("");
      if (inputRef.current) inputRef.current.value = "";
      setUploadOpen(false);
      router.refresh();
    } catch (cause) {
      if (path)
        void fetch(`/api/staff-documents/${staffId}/upload`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
      setMessage(
        cause instanceof Error ? cause.message : "No fue posible cargar el documento.",
      );
    } finally {
      setPending(false);
      window.setTimeout(() => setProgress(0), 500);
    }
  };

  return (
    <section className="rounded-2xl border p-4 sm:p-5" id="staff-documents">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
            Documentos
          </p>
          <h3 className="mt-1 text-lg font-semibold">Centro documental de {staffName}</h3>
          <p className="mt-1 text-xs text-muted">
            Archivos privados agrupados por colaborador, categoría y período.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition hover:border-brand"
          onClick={() => setUploadOpen((current) => !current)}
          type="button"
        >
          <Upload className="size-4 text-brand" />
          Subir documento
        </button>
      </div>

      {uploadOpen ? (
        <form className="mt-5 grid gap-4 rounded-xl border bg-background/40 p-4 sm:grid-cols-2" onSubmit={upload}>
          <label className="text-sm font-medium">
            Categoría
            <select
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
              onChange={(event) => setCategory(event.target.value as StaffDocumentCategory)}
              value={category}
            >
              {staffDocumentCategoryMeta.map((item) => (
                <option key={item.category} value={item.category}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {periodic ? (
            <label className="text-sm font-medium">
              Mes aplicable
              <input
                className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
                onChange={(event) => setApplicableMonth(event.target.value)}
                required
                type="month"
                value={applicableMonth}
              />
            </label>
          ) : null}
          <label className="text-sm font-medium">
            Nombre visible
            <input
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ej. Contrato de colaboración"
              value={label}
            />
          </label>
          <label className="text-sm font-medium">
            Archivo
            <input
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold"
              ref={inputRef}
              required
              type="file"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-muted">JPG, PNG, WEBP o PDF · máximo 10 MB.</p>
            <button
              className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              disabled={pending}
            >
              {pending ? `Guardando ${progress}%` : "Guardar documento"}
            </button>
          </div>
          {progress ? (
            <div className="h-2 overflow-hidden rounded-full bg-muted/20 sm:col-span-2" aria-label={`Carga ${progress}%`}>
              <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </form>
      ) : null}

      {message ? (
        <p className={`mt-4 text-sm font-medium ${message.startsWith("Documento protegido") ? "text-emerald-500" : "text-red-500"}`} role="status">
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {grouped.map((group) => (
          <article className="min-w-0 rounded-xl border bg-background/30 p-4" key={group.category}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold">{group.label.toUpperCase()}</h4>
                <p className="mt-1 text-xs text-muted">{group.folder}</p>
              </div>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                {group.documents.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {group.documents.map((document) => (
                <div className="min-w-0 rounded-lg border p-3" key={`${document.source}-${document.id}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{document.label}</p>
                      <p className="mt-1 break-all text-xs text-muted">{document.fileName}</p>
                      <p className="mt-1 text-xs text-muted">
                        {document.applicableMonth ? `${monthLabel(document.applicableMonth)} · ` : ""}
                        Subido {dateLabel(document.createdAt)} · {document.status === "ACTIVE" ? "Activo" : document.status}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:border-brand"
                      href={`/api/staff-documents/${staffId}/${document.id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="size-3.5" /> Abrir
                    </a>
                    <a
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:border-brand"
                      href={`/api/staff-documents/${staffId}/${document.id}?download=1`}
                    >
                      <Download className="size-3.5" /> Descargar
                    </a>
                  </div>
                </div>
              ))}
              {!group.documents.length ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted">
                  Sin documentos.
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
