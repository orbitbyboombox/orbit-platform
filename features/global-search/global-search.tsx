"use client";

import { Building2, CalendarDays, FileText, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GLOBAL_SEARCH_GROUPS, globalSearchNoResultsMessage, type GlobalSearchKind, type GlobalSearchResult } from "./model";

const icons: Record<GlobalSearchKind, typeof Search> = {
  CUSTOMER: UserRound,
  COMPANY: Building2,
  EVENT: CalendarDays,
  QUOTE: FileText,
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setFailed(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/global-search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = (await response.json()) as { results: GlobalSearchResult[] };
        setResults(payload.results);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setFailed(true);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const grouped = useMemo(
    () => GLOBAL_SEARCH_GROUPS.map((group) => ({
      ...group,
      results: results.filter((result) => result.kind === group.kind),
    })).filter((group) => group.results.length > 0),
    [results],
  );

  return (
    <>
      <button
        aria-label="Abrir búsqueda global"
        className="ml-auto inline-flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/75 text-muted transition hover:text-foreground md:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="size-4" />
      </button>
      <button
        aria-label="Abrir búsqueda global"
        className="ml-auto hidden h-10 w-full max-w-[18rem] items-center gap-2 rounded-xl border border-border/80 bg-card/75 px-3 text-left text-sm text-muted shadow-sm transition hover:border-brand/40 hover:text-foreground md:flex lg:max-w-[22rem] xl:max-w-[24rem]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Buscar clientes, empresas o eventos...</span>
        <kbd className="rounded-md border bg-accent/70 px-1.5 py-1 text-[10px] font-semibold">⌘K</kbd>
      </button>
      {open ? (
        <div aria-label="Búsqueda global" aria-modal="true" className="fixed inset-0 z-[100] bg-background md:bg-black/65 md:p-6" role="dialog">
          <div className="mx-auto flex h-full w-full flex-col bg-background md:mt-[7vh] md:h-auto md:max-h-[78vh] md:max-w-2xl md:overflow-hidden md:rounded-2xl md:border md:bg-card md:shadow-2xl">
            <div className="flex min-h-16 items-center gap-3 border-b px-4 sm:px-5">
              <Search className="size-5 shrink-0 text-brand" />
              <input
                aria-label="Buscar en ORBIT"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cliente, empresa, evento, código ORBIT o contacto"
                ref={inputRef}
                type="search"
                value={query}
              />
              <Button aria-label="Cerrar búsqueda" onClick={close} size="icon" variant="ghost"><X className="size-4" /></Button>
            </div>
            <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {query.trim().length < 2 ? <Empty title="Busca en todo ORBIT" detail="Escribe al menos dos caracteres para comenzar." /> : null}
              {loading ? <p className="py-10 text-center text-sm text-muted">Buscando…</p> : null}
              {!loading && failed ? <Empty title="No fue posible buscar" detail="Reintenta en unos segundos." /> : null}
              {!loading && !failed && query.trim().length >= 2 && results.length === 0 ? <Empty title={globalSearchNoResultsMessage(query)} detail="Prueba con nombre, RUT, teléfono, evento o número de cotización." /> : null}
              {!loading && !failed ? grouped.map((group) => (
                <section className="mb-6 last:mb-0" key={group.kind}>
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-brand">{group.label}</h2>
                  <div className="space-y-1">
                    {group.results.map((result) => {
                      const Icon = icons[result.kind];
                      return <Link className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-accent focus:bg-accent focus:outline-none" href={result.href} key={`${result.kind}-${result.id}`} onClick={close}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{result.title}</span><span className="mt-0.5 block truncate text-xs text-muted">{result.subtitle}</span></span></Link>;
                    })}
                  </div>
                </section>
              )) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-48 place-items-center text-center"><div><Search className="mx-auto size-6 text-muted" /><p className="mt-4 font-semibold">{title}</p><p className="mt-2 text-sm text-muted">{detail}</p></div></div>;
}
