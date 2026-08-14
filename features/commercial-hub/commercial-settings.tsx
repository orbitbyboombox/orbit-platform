"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, ExternalLink, FileText, History, RotateCcw, Save, Upload } from "lucide-react";
import {
  activateCommercialDocumentAction,
  getCommercialDocumentUrlAction,
  restoreCommercialTemplateAction,
  updateCommercialTemplateAction,
  uploadCommercialDocumentAction,
} from "./settings.actions";
import type { CommercialDocument, CommercialTemplate } from "./types";
export function CommercialSettings({
  templates,
  documents,
  initialCategory,
  returnTo,
}: {
  templates: CommercialTemplate[];
  documents: Array<CommercialDocument & { status: string; uploadedAt: string }>;
  initialCategory?: string;
  returnTo?: string;
}) {
  const categories = ["WEDDINGS", "COMPANIES", "EVENTS"] as const;
  type Category = (typeof categories)[number];
  const selectedInitial = categories.includes(initialCategory as Category) ? initialCategory as Category : undefined;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [uploadCategory, setUploadCategory] = useState<Category | null>(selectedInitial ?? null);
  const [versionsCategory, setVersionsCategory] = useState<Category | null>(null);
  const labels: Record<Category, string> = {
    WEDDINGS: "Matrimonios / Novios",
    COMPANIES: "Empresas",
    EVENTS: "Eventos",
  };
  return (
    <section className="scroll-mt-24 space-y-6 rounded-3xl border bg-background p-4 sm:p-6" id="commercial-documents">
      <div>
        {returnTo && <Link className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand" href={returnTo}><ArrowLeft className="size-4" />Volver a Cotizar</Link>}
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Configuración comercial</p>
        <h2 className="mt-2 text-2xl font-semibold">Documentos Comerciales</h2>
        <p className="mt-2 text-sm text-muted">
          Administra los catálogos de Matrimonios, Empresas y Eventos. Los envíos utilizan siempre la versión activa.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {categories.map((category) => {
          const categoryDocuments = documents.filter((item) => item.category === category);
          const active = categoryDocuments.find((item) => item.status === "ACTIVE");
          return <article className={`rounded-2xl border bg-card p-5 ${selectedInitial === category ? "border-brand/60 ring-1 ring-brand/20" : ""}`} id={`document-category-${category.toLowerCase()}`} key={category}>
            <div className="flex items-start gap-3"><span className="rounded-xl border bg-background p-2.5 text-brand"><FileText className="size-5" /></span><div><h3 className="font-semibold">{labels[category]}</h3><p className={`mt-1 text-sm ${active ? "text-emerald-500" : "text-muted"}`}>{active ? `Activo · ${active.name} ${active.version}` : "Sin catálogo"}</p></div></div>
            <div className="mt-5 grid gap-2">
              <Button className="min-h-11 w-full" onClick={() => setUploadCategory(uploadCategory === category ? null : category)}><Upload />Subir nueva versión</Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button disabled={!active || pending} variant="outline" onClick={() => active && start(async () => { const result = await getCommercialDocumentUrlAction(active.id); if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer"); else setMessage(result.error); })}><ExternalLink />Ver</Button>
                <Button variant="outline" onClick={() => setVersionsCategory(versionsCategory === category ? null : category)}><History />Gestionar versiones</Button>
              </div>
            </div>
            {uploadCategory === category && <form action={(form) => start(async () => { const result = await uploadCommercialDocumentAction(form); setMessage(result.ok ? result.message : result.error); if (result.ok) { setUploadCategory(null); router.refresh(); } })} className="mt-4 grid gap-3 rounded-xl border bg-background p-4">
              <input name="category" type="hidden" value={category} />
              <label className="grid gap-1 text-sm font-medium">Nombre<input className="min-h-11 rounded-xl border bg-card px-3 text-base" name="name" placeholder={`Catálogo ${labels[category]}`} required /></label>
              <label className="grid gap-1 text-sm font-medium">Versión<input className="min-h-11 rounded-xl border bg-card px-3 text-base" name="version" placeholder="2026–2027" required /></label>
              <label className="grid gap-2 text-sm font-medium">Archivo PDF<input accept="application/pdf" className="min-h-11 w-full text-base file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand" name="file" required type="file" /></label>
              <Button disabled={pending}>{pending ? "Cargando…" : "Cargar PDF"}</Button>
            </form>}
            {versionsCategory === category && <div className="mt-4 space-y-2 rounded-xl border bg-background p-3">
              {categoryDocuments.length === 0 ? <p className="text-sm text-muted">Aún no hay versiones cargadas.</p> : categoryDocuments.map((document) => <div className="rounded-lg border bg-card p-3" key={document.id}><p className="font-medium">{document.name} · {document.version}</p><p className="mt-1 text-xs text-muted">{document.status === "ACTIVE" ? "ACTIVO" : document.status === "ARCHIVED" ? "ARCHIVADO" : "PENDIENTE"} · {document.uploadedAt.slice(0, 10)}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => start(async () => { const result = await getCommercialDocumentUrlAction(document.id); if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer"); else setMessage(result.error); })}>Ver</Button>{document.status !== "ACTIVE" && <Button size="sm" onClick={() => start(async () => { const result = await activateCommercialDocumentAction(document.id); setMessage(result.ok ? result.message : result.error); if (result.ok) router.refresh(); })}><Check />Activar</Button>}</div></div>)}
            </div>}
          </article>;
        })}
      </div>
      <div className="border-t pt-6"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Plantillas de correo</p><h3 className="mt-2 text-xl font-semibold">Mensajes comerciales</h3></div>
      <div className="grid gap-4">
        {templates.map((template) => (
          <form
            action={(form) =>
              start(async () => {
                const result = await updateCommercialTemplateAction(form);
                setMessage(result.ok ? result.message : result.error);
              })
            }
            className="rounded-2xl border bg-card p-5"
            key={template.id}
          >
            <input name="id" type="hidden" value={template.id} />
            <p className="font-semibold">{template.category}</p>
            <input
              className="mt-4 min-h-11 w-full rounded-xl border bg-background px-3"
              defaultValue={template.subject}
              name="subject"
            />
            <textarea
              className="mt-3 min-h-48 w-full rounded-xl border bg-background p-3 text-sm"
              defaultValue={template.body}
              name="body"
            />
            <Button className="mt-3" disabled={pending}>
              <Save />
              Guardar plantilla
            </Button>
            <Button className="mt-3 ml-2" disabled={pending} type="button" variant="outline" onClick={() => start(async () => { const result = await restoreCommercialTemplateAction(template.id); setMessage(result.ok ? result.message : result.error); })}>
              <RotateCcw /> Restaurar original
            </Button>
          </form>
        ))}
      </div>
      {message && (
        <p aria-live="polite" className="text-sm font-medium">
          {message}
        </p>
      )}
    </section>
  );
}
