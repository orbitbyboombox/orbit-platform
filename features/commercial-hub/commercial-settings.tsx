"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink, RotateCcw, Save, Upload } from "lucide-react";
import {
  activateCommercialDocumentAction,
  getCommercialDocumentUrlAction,
  restoreCommercialTemplateAction,
  updateCommercialTemplateAction,
  uploadCommercialDocumentAction,
} from "./settings.actions";
import type { CommercialDocument, CommercialTemplate } from "./types";
import { documentCategoryLabel } from "./presentation";
export function CommercialSettings({
  templates,
  documents,
}: {
  templates: CommercialTemplate[];
  documents: Array<CommercialDocument & { status: string; uploadedAt: string }>;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-6" id="commercial-settings">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Configuración comercial
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          Plantillas y documentos comerciales
        </h2>
        <p className="mt-2 text-sm text-muted">
          Carga cada catálogo una sola vez. Los envíos utilizan automáticamente la versión activa hasta que publiques una nueva.
        </p>
      </div>
      <form
        action={(form) =>
          start(async () => {
            const result = await uploadCommercialDocumentAction(form);
            setMessage(result.ok ? result.message : result.error);
          })
        }
        className="grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input
          className="min-h-11 rounded-xl border bg-background px-3"
          name="name"
          placeholder="Nombre del documento"
          required
        />
        <select
          className="min-h-11 rounded-xl border bg-background px-3"
          name="category"
        >
          <option value="WEDDINGS">Novios / Matrimonios</option>
          <option value="COMPANIES">Empresas</option>
          <option value="EVENTS">Eventos / Cumpleaños / Graduaciones</option>
        </select>
        <input
          className="min-h-11 rounded-xl border bg-background px-3"
          name="version"
          placeholder="2026–2027"
          required
        />
        <input
          accept="application/pdf"
          className="text-sm"
          name="file"
          required
          type="file"
        />
        <Button disabled={pending} className="sm:col-span-2 lg:col-span-4">
          <Upload />
          {pending ? "Cargando…" : "Cargar nueva versión"}
        </Button>
      </form>
      <div className="grid gap-3">
        {documents.map((document) => (
          <article
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            key={document.id}
          >
            <div>
              <p className="font-semibold">{document.name}</p>
              <p className="text-sm text-muted">
                {documentCategoryLabel(document.category)} · {document.version} · {document.status === "ACTIVE" ? "ACTIVO" : document.status === "ARCHIVED" ? "ARCHIVADO" : "PENDIENTE"} ·{" "}
                {document.uploadedAt.slice(0, 10)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                start(async () => {
                  const result = await getCommercialDocumentUrlAction(
                    document.id,
                  );
                  if (result.ok)
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  else setMessage(result.error);
                })
              }
            >
              <ExternalLink />
              Vista previa
            </Button>
            {document.status !== "ACTIVE" && (
              <Button onClick={() => start(async () => { const result = await activateCommercialDocumentAction(document.id); setMessage(result.ok ? result.message : result.error); })}>
                <Check /> Activar
              </Button>
            )}
          </article>
        ))}
      </div>
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
