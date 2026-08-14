"use client";

import { Download, Share2 } from "lucide-react";

export function CatalogActions({ name }: { name: string }) {
  const share = async () => {
    if (navigator.share) await navigator.share({ title: `${name} · BOOMBOX`, url: window.location.href });
    else await navigator.clipboard.writeText(window.location.href);
  };
  return <div className="flex flex-wrap gap-3">
    <a className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f78900] px-5 font-semibold text-black" href="document?download=1"><Download className="size-4" />Descargar PDF</a>
    <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-5 font-semibold" onClick={() => void share()} type="button"><Share2 className="size-4" />Compartir</button>
  </div>;
}
