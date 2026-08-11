"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function MunicipalityCombobox({ items, onChange, value }: { items: ActiveMunicipality[]; onChange: (value: string) => void; value: string }) {
  const id = useId();
  const listId = `${id}-options`;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setQuery(value), [value]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-CL");
    return items.filter((item) => !normalized || item.name.toLocaleLowerCase("es-CL").includes(normalized)).slice(0, 50);
  }, [items, query]);
  const selected = items.find((item) => item.name === value);
  return <div className="relative"><label className="block text-sm font-medium" htmlFor={id}>Comuna</label><input aria-autocomplete="list" aria-controls={listId} aria-expanded={open} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={id} onBlur={() => setTimeout(() => setOpen(false), 100)} onChange={(event) => { setQuery(event.target.value); onChange(""); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Busca y selecciona una comuna" role="combobox" value={query}/>{open ? <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-xl" id={listId} role="listbox">{filtered.map((item) => <button aria-selected={item.name === value} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-accent focus:bg-accent" key={`${item.province}-${item.name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(item.name); onChange(item.name); setOpen(false); }} role="option" type="button"><span className="font-medium">{item.name}</span><span className="text-xs text-muted">{item.province}</span></button>)}{filtered.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No hay comunas activas que coincidan.</p> : null}</div> : null}{query && !selected ? <p className="mt-2 text-xs text-danger">Selecciona una comuna de la lista.</p> : null}{selected ? <p className="mt-2 text-xs text-muted">Provincia {selected.province} · Transporte {selected.pricingStatus === "REQUIRES_QUOTE" ? "por confirmar" : selected.transport ? money(selected.transport) : "incluido"}</p> : null}</div>;
}
