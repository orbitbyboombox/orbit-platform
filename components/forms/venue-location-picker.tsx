"use client";

import { useId, useMemo } from "react";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";

type Venue = { name: string; municipality: string; province?: string; surcharge?: number; aliases?: string[]; enabled?: boolean };
type Props = { venues: Venue[]; municipalities: ActiveMunicipality[]; venue: string; municipality: string; specialVenue?: string; onVenueChange: (value: string) => void; onMunicipalityChange: (value: string) => void; onSpecialVenueChange?: (value: string) => void };
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

/** Lugar del evento is free text; only Comuna controls structured logistics and special surcharges. */
export function VenueLocationPicker({ venues, municipalities, venue, municipality, specialVenue = "", onVenueChange, onMunicipalityChange, onSpecialVenueChange }: Props) {
  const id = useId();
  const options = useMemo(() => municipalities.flatMap((item) => {
    const special = venues.filter((candidate) => candidate.enabled !== false && candidate.municipality === item.name && Number(candidate.surcharge ?? 0) > 0);
    return [{ value: item.name, label: item.name, municipality: item.name, specialVenue: "" }, ...special.map((candidate) => ({ value: `${item.name}::${candidate.name}`, label: `${item.name} - ${candidate.name}`, municipality: item.name, specialVenue: candidate.name }))];
  }), [municipalities, venues]);
  const selectedValue = specialVenue ? `${municipality}::${specialVenue}` : municipality;
  const selected = venues.find((candidate) => candidate.name === specialVenue && candidate.municipality === municipality);
  const handleCommune = (value: string) => { const option = options.find((item) => item.value === value); if (!option) return; onMunicipalityChange(option.municipality); onSpecialVenueChange?.(option.specialVenue); };
  return <div className="grid gap-4">
    <label className="block text-sm font-medium" htmlFor={`${id}-venue`}>Lugar del evento<input aria-describedby={`${id}-venue-help`} className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={`${id}-venue`} onChange={(event) => onVenueChange(event.target.value)} placeholder="Escribe cualquier lugar o recinto" type="text" value={venue}/><span className="mt-1 block text-xs text-muted" id={`${id}-venue-help`}>Texto libre. No necesitas que el recinto esté en el catálogo.</span></label>
    <label className="block text-sm font-medium" htmlFor={`${id}-commune`}>Comuna<select className="mt-2 h-12 w-full rounded-xl border bg-background px-4" id={`${id}-commune`} onChange={(event) => handleCommune(event.target.value)} value={selectedValue}><option value="">Selecciona la comuna</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block text-xs text-muted">La comuna define la logística y el traslado.</span></label>
    {selected && Number(selected.surcharge ?? 0) > 0 ? <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">Valor adicional de traslado: {money(Number(selected.surcharge))}</p> : null}
  </div>;
}
