"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { resolveCanonicalVenue } from "@/features/settings/master-data/venue-resolution";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";

type Venue = {
  name: string;
  municipality: string;
  province?: string;
  surcharge?: number;
  aliases?: string[];
  enabled?: boolean;
};

type Props = {
  venues: Venue[];
  municipalities: ActiveMunicipality[];
  venue: string;
  municipality: string;
  onVenueChange: (value: string) => void;
  onMunicipalityChange: (value: string) => void;
};

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function VenueLocationPicker({ venues, municipalities, venue, municipality, onVenueChange, onMunicipalityChange }: Props) {
  const [query, setQuery] = useState(venue);
  const [open, setOpen] = useState(false);
  const id = useId();
  const optionsId = `${id}-options`;
  useEffect(() => setQuery(venue), [venue]);

  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-CL");
    const communeOptions = municipalities
      .filter((item) => !normalized || item.name.toLocaleLowerCase("es-CL").includes(normalized))
      .slice(0, 30)
      .map((item) => ({ kind: "commune" as const, key: `commune-${item.name}`, label: item.name, municipality: item.name }));
    const venueOptions = venues
      .filter((item) => item.enabled !== false && (!normalized || `${item.name} ${item.municipality}`.toLocaleLowerCase("es-CL").includes(normalized)))
      .slice(0, 30)
      .map((item) => ({ kind: "venue" as const, key: `venue-${item.municipality}-${item.name}`, label: `${item.municipality} · ${item.name}`, municipality: item.municipality, name: item.name }));
    return [...communeOptions, ...venueOptions];
  }, [municipalities, query, venues]);

  const selectedVenue = resolveCanonicalVenue(venue, municipality, venues);
  const selectCommune = (value: string) => {
    setQuery("");
    onVenueChange("");
    onMunicipalityChange(value);
    setOpen(false);
  };
  const selectVenue = (name: string, value: string) => {
    setQuery(name);
    onVenueChange(name);
    onMunicipalityChange(value);
    setOpen(false);
  };

  return <div className="relative">
    <label className="block text-sm font-medium" htmlFor={id}>Lugar del evento</label>
    <input aria-autocomplete="list" aria-controls={optionsId} aria-expanded={open} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={id} onBlur={() => setTimeout(() => setOpen(false), 100)} onChange={(event) => { setQuery(event.target.value); onVenueChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Escribe el lugar o selecciona una sugerencia" role="combobox" value={query}/>
    {open ? <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-xl" id={optionsId} role="listbox">
      {options.map((option) => <button aria-label={option.label} aria-selected={false} className="flex w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-accent focus:bg-accent" key={option.key} onMouseDown={(event) => event.preventDefault()} onClick={() => option.kind === "venue" ? selectVenue(option.name, option.municipality) : selectCommune(option.municipality)} role="option" type="button"><span className="font-medium">{option.label}</span></button>)}
      {options.length === 0 ? <p className="px-3 py-4 text-sm text-muted">Puedes continuar con un recinto no catalogado.</p> : null}
    </div> : null}
    {selectedVenue && Number(selectedVenue.surcharge ?? 0) > 0 ? <p className="mt-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">Valor adicional de traslado: {money(Number(selectedVenue.surcharge))}</p> : null}
  </div>;
}
