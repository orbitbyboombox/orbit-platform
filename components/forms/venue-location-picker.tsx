"use client";

import { useId, useMemo, useState } from "react";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";

type Venue = { name: string; municipality: string; province?: string; surcharge?: number; aliases?: string[]; enabled?: boolean };
type Props = { venues: Venue[]; municipalities: ActiveMunicipality[]; venue: string; municipality: string; specialVenue?: string; onVenueChange: (value: string) => void; onMunicipalityChange: (value: string) => void; onSpecialVenueChange?: (value: string) => void };
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

/** Lugar del evento is free text; only Comuna controls structured logistics and special surcharges. */
export function VenueLocationPicker({ venues, municipalities, venue, municipality, specialVenue = "", onVenueChange, onMunicipalityChange, onSpecialVenueChange }: Props) {
  const id = useId();
  const [communeQuery, setCommuneQuery] = useState("");
  const [communeOpen, setCommuneOpen] = useState(false);
  const options = useMemo(() => municipalities.flatMap((item) => {
    const special = venues.filter((candidate) => candidate.enabled !== false && candidate.municipality === item.name && Number(candidate.surcharge ?? 0) > 0);
    return [{ value: item.name, label: item.name, municipality: item.name, specialVenue: "" }, ...special.map((candidate) => ({ value: `${item.name}::${candidate.name}`, label: `${item.name} - ${candidate.name}`, municipality: item.name, specialVenue: candidate.name }))];
  }), [municipalities, venues]);
  const selectedValue = specialVenue ? `${municipality}::${specialVenue}` : municipality;
  const selectedOption = options.find((item) => item.value === selectedValue);
  const filteredOptions = useMemo(() => {
    const query = communeQuery.trim().toLocaleLowerCase("es-CL");
    if (!query) return options;
    return options.filter((item) => item.label.toLocaleLowerCase("es-CL").includes(query));
  }, [communeQuery, options]);
  const selected = venues.find((candidate) => candidate.name === specialVenue && candidate.municipality === municipality);
  const handleCommune = (value: string) => { const option = options.find((item) => item.value === value); if (!option) return; onMunicipalityChange(option.municipality); onSpecialVenueChange?.(option.specialVenue); setCommuneQuery(""); setCommuneOpen(false); };
  return <div className="grid gap-4">
    <label className="block text-sm font-medium" htmlFor={`${id}-venue`}>Lugar del evento<input aria-describedby={`${id}-venue-help`} autoComplete="off" className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={`${id}-venue`} onChange={(event) => onVenueChange(event.target.value)} placeholder="Escribe el nombre del lugar del evento" type="text" value={venue}/><span className="mt-1 block text-xs text-muted" id={`${id}-venue-help`}>Texto libre. No necesitas que el recinto esté en el catálogo.</span></label>
    <div className="relative">
      <label className="block text-sm font-medium" htmlFor={`${id}-commune`}>Comuna</label>
      <input aria-autocomplete="list" aria-controls={`${id}-commune-options`} aria-expanded={communeOpen} className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={`${id}-commune`} onBlur={() => window.setTimeout(() => setCommuneOpen(false), 120)} onChange={(event) => { setCommuneQuery(event.target.value); setCommuneOpen(true); }} onFocus={() => setCommuneOpen(true)} placeholder="Busca una comuna" role="combobox" value={communeOpen ? communeQuery : (selectedOption?.label ?? "")}/>
      {communeOpen ? <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-background shadow-xl" id={`${id}-commune-options`} role="listbox">{filteredOptions.length ? filteredOptions.map((option) => <button aria-selected={option.value === selectedValue} className="block w-full px-4 py-3 text-left text-sm hover:bg-muted/20" key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => handleCommune(option.value)} role="option" type="button">{option.label}</button>) : <p className="px-4 py-3 text-sm text-muted">No encontramos esa comuna.</p>}</div> : null}
      <span className="mt-1 block text-xs text-muted">La comuna define la logística y el traslado.</span>
    </div>
    {selected && Number(selected.surcharge ?? 0) > 0 ? <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">Valor adicional de traslado: {money(Number(selected.surcharge))}</p> : null}
  </div>;
}
