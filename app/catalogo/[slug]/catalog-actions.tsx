"use client";

import { Download, Share2 } from "lucide-react";
import { useState } from "react";

export function CatalogActions({ name, slug }: { name: string; slug: string }) {
  const downloadUrl = `/catalogo/${encodeURIComponent(slug)}/document?download=1`;
  const [message, setMessage] = useState("");
  const share = async () => {
    setMessage("");
    if (navigator.share) {
      try { await navigator.share({ title: `${name} · BOOMBOX`, url: window.location.href }); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    if (navigator.clipboard) await navigator.clipboard.writeText(window.location.href);
    else {
      const field = document.createElement("textarea"); field.value = window.location.href; field.style.position = "fixed"; field.style.opacity = "0";
      document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove();
    }
    setMessage("Link copiado");
  };
  return <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
    <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold sm:px-5 sm:text-base" href={downloadUrl} style={{ backgroundColor: "#f78900", color: "#050505" }}><Download className="size-4" />Descargar</a>
    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold sm:px-5 sm:text-base" onClick={() => void share()} type="button"><Share2 className="size-4" />Compartir</button>
    {message && <span aria-live="polite" className="col-span-2 text-center text-xs text-white/60 sm:text-sm">{message}</span>}
  </div>;
}
