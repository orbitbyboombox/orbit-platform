"use client";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  Archive,
  BookOpen,
  EyeOff,
  FilePlus2,
  History,
  Megaphone,
  Pencil,
  PlayCircle,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  saveAcademyArticleAction,
  setAcademyArticleStatusAction,
} from "./actions";
import {
  ACADEMY_TYPES,
  type AcademyArticle,
  type AcademyStaffStat,
  type AcademyType,
} from "./types";
const input =
  "min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm";
const icons: Record<AcademyType, typeof BookOpen> = {
  MANUAL: BookOpen,
  VIDEO: PlayCircle,
  CHECKLIST: BookOpen,
  PROTOCOL: BookOpen,
  FAQ: BookOpen,
  DOWNLOAD: Upload,
  ANNOUNCEMENT: Megaphone,
};

export function AcademyManager({
  articles,
  stats,
}: {
  articles: AcademyArticle[];
  stats: AcademyStaffStat[];
}) {
  const [editing, setEditing] = useState<AcademyArticle | null | "new">(null),
    [query, setQuery] = useState(""),
    [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  const filtered = useMemo(
    () =>
      articles.filter((item) =>
        `${item.title} ${item.category} ${item.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [articles, query],
  );
  const status = (
    id: string,
    value: "PUBLISHED" | "HIDDEN" | "ARCHIVED" | "DELETED",
  ) =>
    start(async () => {
      const result = await setAcademyArticleStatusAction(id, value);
      setMessage(result.message);
      if (result.ok) location.reload();
    });
  return (
    <section className="space-y-6">
      <header className="rounded-3xl border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          BOOMBOX Academy
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold">Academy Manager</h2>
            <p className="mt-2 text-sm text-muted">
              Fuente oficial y versionada del conocimiento operacional BOOMBOX.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground"
            onClick={() => setEditing("new")}
          >
            <FilePlus2 className="size-4" />
            Nuevo contenido
          </button>
        </div>
      </header>
      {message ? (
        <p className="rounded-xl border border-brand/20 bg-brand/10 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <section className="rounded-3xl border bg-card p-5">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted" />
          <input
            className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3"
            placeholder="Buscar artículos, categorías o palabras clave"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {filtered.map((item) => (
            <ArticleCard
              item={item}
              key={item.id}
              edit={() => setEditing(item)}
              status={(value) => status(item.id, value)}
            />
          ))}
          {!filtered.length ? (
            <p className="py-8 text-sm text-muted">
              No hay contenido para esta búsqueda.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Estado de capacitación</h2>
        <p className="mt-1 text-sm text-muted">
          Seguimiento informativo. La Academy nunca obliga a completar
          contenidos.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="p-3">Colaborador</th>
                <th>Manuales leídos</th>
                <th>Videos vistos</th>
                <th>Último acceso</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="p-3 font-medium">{item.name}</td>
                  <td>{item.manualsRead}</td>
                  <td>{item.videosWatched}</td>
                  <td>
                    {item.lastAccess
                      ? new Date(item.lastAccess).toLocaleString("es-CL")
                      : "Sin acceso"}
                  </td>
                  <td>{item.completion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing ? (
        <ArticleEditor
          article={editing === "new" ? null : editing}
          close={() => setEditing(null)}
          pending={pending}
          report={setMessage}
        />
      ) : null}
    </section>
  );
}

function ArticleCard({
  item,
  edit,
  status,
}: {
  item: AcademyArticle;
  edit: () => void;
  status: (value: "PUBLISHED" | "HIDDEN" | "ARCHIVED" | "DELETED") => void;
}) {
  const Icon = icons[item.type];
  return (
    <article className="rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.title}</h3>
            <span className="rounded-full border px-2 py-0.5 text-[11px]">
              v{item.versionLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${item.status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}
            >
              {item.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {item.category} ·{" "}
            {ACADEMY_TYPES.find((type) => type.value === item.type)?.label}
          </p>
          <p className="mt-2 line-clamp-2 text-sm">
            {item.description || "Sin descripción."}
          </p>
          <details className="mt-3 text-xs text-muted">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
              <History className="size-3.5" /> Historial de versiones
            </summary>
            <ol className="mt-2 space-y-1 border-l pl-3">
              {item.versions.map((version, index) => (
                <li key={version.id}>
                  v{version.versionLabel} ·{" "}
                  {version.publishedOn ?? "Sin publicar"}
                  {index ? " · Archivada" : " · Actual"}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
        <Action label="Editar / Versionar" icon={Pencil} onClick={edit} />
        {item.status !== "PUBLISHED" ? (
          <Action
            label="Publicar"
            icon={Upload}
            onClick={() => status("PUBLISHED")}
          />
        ) : (
          <Action
            label="Ocultar"
            icon={EyeOff}
            onClick={() => status("HIDDEN")}
          />
        )}
        <Action
          label="Archivar"
          icon={Archive}
          onClick={() => status("ARCHIVED")}
        />
        <Action
          danger
          label="Eliminar"
          icon={Trash2}
          onClick={() => status("DELETED")}
        />
      </div>
    </article>
  );
}
function Action({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${danger ? "text-red-400" : ""}`}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function ArticleEditor({
  article,
  close,
  pending,
  report,
}: {
  article: AcademyArticle | null;
  close: () => void;
  pending: boolean;
  report: (value: string) => void;
}) {
  const [type, setType] = useState<AcademyType>(article?.type ?? "MANUAL"),
    [uploading, setUploading] = useState(false),
    [upload, setUpload] = useState<{
      path: string;
      name: string;
      mime: string;
      size: number;
    } | null>(null),
    [thumbnail, setThumbnail] = useState<{
      path: string;
      name: string;
    } | null>(null);
  const submit = async (data: FormData) => {
    if (upload) {
      data.set("filePath", upload.path);
      data.set("fileName", upload.name);
      data.set("mimeType", upload.mime);
      data.set("fileSize", String(upload.size));
    }
    if (thumbnail) data.set("thumbnailPath", thumbnail.path);
    const result = await saveAcademyArticleAction(data);
    report(result.message);
    if (result.ok) location.reload();
  };
  const uploadFile = async (
    file: File,
    kind: "file" | "thumbnail" = "file",
  ) => {
    setUploading(true);
    try {
      const response = await fetch("/api/academy/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            size: file.size,
          }),
        }),
        payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const sent = await fetch(payload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!sent.ok) throw new Error(`La carga respondió ${sent.status}.`);
      if (kind === "thumbnail") {
        setThumbnail({ path: payload.path, name: file.name });
      } else {
        setUpload({
          path: payload.path,
          name: file.name,
          mime: file.type,
          size: file.size,
        });
      }
    } catch (error) {
      report(
        error instanceof Error
          ? error.message
          : "No fue posible subir el archivo.",
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
      <form
        action={submit}
        className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border bg-card p-5 sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Academy Manager
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {article ? "Crear nueva versión" : "Nuevo contenido"}
            </h2>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <input name="articleId" type="hidden" value={article?.id ?? ""} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <select
              className={input}
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as AcademyType)}
            >
              {ACADEMY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <input
              className={input}
              defaultValue={article?.category}
              name="category"
              required
            />
          </Field>
          <Field label="Título">
            <input
              className={input}
              defaultValue={article?.title}
              name="title"
              required
            />
          </Field>
          <Field label="Versión">
            <input
              className={input}
              defaultValue={article?.versionLabel ?? "1.0"}
              name="versionLabel"
              required
            />
          </Field>
          <Field label="Descripción">
            <textarea
              className={`${input} min-h-24`}
              defaultValue={article?.description}
              name="description"
            />
          </Field>
          <Field label="Palabras clave (separadas por coma)">
            <textarea
              className={`${input} min-h-24`}
              defaultValue={article?.keywords.join(", ")}
              name="keywords"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label={type === "FAQ" ? "Respuesta / contenido" : "Contenido"}
            >
              <textarea
                className={`${input} min-h-36`}
                defaultValue={article?.body}
                name="body"
              />
            </Field>
          </div>
          {type === "CHECKLIST" ? (
            <div className="sm:col-span-2">
              <Field label="Ítems del checklist (uno por línea)">
                <textarea
                  className={`${input} min-h-36`}
                  defaultValue={article?.items
                    .map((item) => item.label)
                    .join("\n")}
                  name="checklistItems"
                />
              </Field>
            </div>
          ) : (
            <input name="checklistItems" type="hidden" />
          )}
          {["MANUAL", "VIDEO", "DOWNLOAD"].includes(type) ? (
            <>
              <Field label="Archivo privado">
                <input
                  accept={type === "VIDEO" ? "video/mp4" : undefined}
                  className={input}
                  type="file"
                  onChange={(event) =>
                    event.target.files?.[0] &&
                    void uploadFile(event.target.files[0])
                  }
                />
                <span className="text-xs text-muted">
                  {uploading
                    ? "Subiendo…"
                    : upload
                      ? `✓ ${upload.name}`
                      : (article?.fileName ?? "Sin archivo")}
                </span>
              </Field>
              {type === "VIDEO" ? (
                <>
                  <Field label="Duración (segundos)">
                    <input
                      className={input}
                      defaultValue={article?.durationSeconds ?? ""}
                      min="0"
                      name="durationSeconds"
                      type="number"
                    />
                  </Field>
                  <Field label="Miniatura del video">
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className={input}
                      type="file"
                      onChange={(event) =>
                        event.target.files?.[0] &&
                        void uploadFile(event.target.files[0], "thumbnail")
                      }
                    />
                    <span className="text-xs text-muted">
                      {thumbnail
                        ? `✓ ${thumbnail.name}`
                        : article?.thumbnailPath
                          ? "Miniatura actual conservada"
                          : "Sin miniatura"}
                    </span>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="min-h-11 rounded-xl border px-4"
            onClick={close}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-50"
            disabled={pending || uploading}
          >
            {pending ? "Guardando…" : "Guardar versión"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
