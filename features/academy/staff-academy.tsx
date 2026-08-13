"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Megaphone,
  PlayCircle,
  Search,
  Wrench,
  X,
} from "lucide-react";
import {
  markAcademyProgressAction,
  toggleAcademyChecklistItemAction,
} from "./staff-actions";
import {
  ACADEMY_TYPES,
  type AcademyArticle,
  type AcademyProgress,
  type AcademyType,
} from "./types";
const icons: Record<AcademyType, typeof BookOpen> = {
  MANUAL: BookOpen,
  VIDEO: PlayCircle,
  CHECKLIST: CheckCircle2,
  PROTOCOL: Wrench,
  FAQ: BookOpen,
  DOWNLOAD: Download,
  ANNOUNCEMENT: Megaphone,
};
export function StaffAcademy({
  articles,
  progress,
  completedItems,
}: {
  articles: AcademyArticle[];
  progress: AcademyProgress[];
  completedItems: string[];
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("ALL"),
    [selected, setSelected] = useState<AcademyArticle | null>(null);
  const categories = ["ALL", ...new Set(articles.map((item) => item.type))],
    filtered = useMemo(
      () =>
        articles.filter(
          (item) =>
            (category === "ALL" || item.type === category) &&
            `${item.title} ${item.description} ${item.category} ${item.keywords.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
      [articles, category, query],
    );
  const open = (article: AcademyArticle) => {
    setSelected(article);
    void markAcademyProgressAction(
      article.id,
      !["VIDEO", "CHECKLIST"].includes(article.type),
    );
  };
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
                Portal Staff
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                🎓 BOOMBOX Academy
              </h1>
              <p className="mt-2 text-muted">
                Conocimiento operacional oficial, siempre disponible.
              </p>
            </div>
            <Link
              className="min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold"
              href="/staff-portal"
            >
              Volver a Mi Portal
            </Link>
          </div>
        </header>
        <section className="rounded-3xl border bg-card p-5">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 size-4 text-muted" />
            <input
              className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3"
              placeholder="Buscar manuales, videos, protocolos, FAQs o palabras clave"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {categories.map((value) => (
              <button
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold ${category === value ? "border-brand bg-brand/10 text-brand" : ""}`}
                key={value}
                onClick={() => setCategory(value)}
              >
                {value === "ALL"
                  ? "Todo"
                  : ACADEMY_TYPES.find((type) => type.value === value)?.label}
              </button>
            ))}
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((article) => {
            const Icon = icons[article.type],
              seen = progress.some((item) => item.articleId === article.id),
              isNew = article.type === "ANNOUNCEMENT" && !seen;
            return (
              <button
                className="rounded-2xl border bg-card p-5 text-left transition hover:border-brand/40"
                key={article.id}
                onClick={() => open(article)}
              >
                <div className="flex items-start justify-between">
                  <span className="rounded-xl bg-brand/10 p-3 text-brand">
                    <Icon className="size-5" />
                  </span>
                  {isNew ? (
                    <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground">
                      Nuevo
                    </span>
                  ) : seen ? (
                    <span className="text-xs text-emerald-500">✓ Visto</span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-lg font-semibold">{article.title}</h2>
                <p className="mt-1 text-xs text-brand">
                  {article.category} · v{article.versionLabel}
                </p>
                <p className="mt-3 line-clamp-3 text-sm text-muted">
                  {article.description}
                </p>
              </button>
            );
          })}
          {!filtered.length ? (
            <p className="py-10 text-sm text-muted">
              No encontramos contenido para esta búsqueda.
            </p>
          ) : null}
        </section>
        {selected ? (
          <ArticleDetail
            article={selected}
            completedItems={completedItems}
            close={() => setSelected(null)}
          />
        ) : null}
      </div>
    </main>
  );
}
function ArticleDetail({
  article,
  completedItems,
  close,
}: {
  article: AcademyArticle;
  completedItems: string[];
  close: () => void;
}) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  const asset = `/api/staff-portal/academy/${article.id}/asset`;
  const toggle = (itemId: string, value: boolean) =>
    start(async () => {
      const result = await toggleAcademyChecklistItemAction(
        article.id,
        itemId,
        value,
      );
      if (!result.ok) setMessage(result.message ?? "");
      else location.reload();
    });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6">
      <article className="max-h-[95dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border bg-card p-5 sm:rounded-3xl sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              {ACADEMY_TYPES.find((item) => item.value === article.type)?.label}{" "}
              · v{article.versionLabel}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{article.title}</h2>
            <p className="mt-2 text-sm text-muted">{article.description}</p>
          </div>
          <button aria-label="Cerrar" onClick={close}>
            <X />
          </button>
        </header>
        {article.type === "VIDEO" && article.filePath ? (
          <video
            className="mt-6 aspect-video w-full rounded-2xl bg-black"
            controls
            onEnded={() =>
              void markAcademyProgressAction(
                article.id,
                true,
                article.durationSeconds ?? 0,
              )
            }
            poster={article.thumbnailPath ? `${asset}?thumbnail=1` : undefined}
            src={asset}
          />
        ) : null}
        {article.body ? (
          <div className="mt-6 whitespace-pre-wrap rounded-2xl border p-5 text-sm leading-7">
            {article.body}
          </div>
        ) : null}
        {article.type === "CHECKLIST" ? (
          <div className="mt-6 space-y-2">
            {article.items.map((item) => {
              const checked = completedItems.includes(item.id);
              return (
                <label
                  className="flex min-h-12 items-center gap-3 rounded-xl border p-3"
                  key={item.id}
                >
                  <input
                    checked={checked}
                    disabled={pending}
                    type="checkbox"
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        ) : null}
        {article.filePath && article.type !== "VIDEO" ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground"
              href={asset}
              target="_blank"
            >
              <FileText className="size-4" />
              Ver
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-semibold"
              href={`${asset}?download=1`}
            >
              <Download className="size-4" />
              Descargar
            </a>
          </div>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-red-400">{message}</p>
        ) : null}
      </article>
    </div>
  );
}
