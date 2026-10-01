"use client";

import { useMemo, useState } from "react";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function TransportValueLookup({
  municipalities,
  initialMunicipality,
  customerType,
}: {
  municipalities: ActiveMunicipality[];
  initialMunicipality: string;
  customerType: "company" | "private";
}) {
  const initial = municipalities.find(
    (item) => item.name.localeCompare(initialMunicipality, "es", { sensitivity: "base" }) === 0,
  )?.name ?? "";
  const [selected, setSelected] = useState(initial);
  const municipality = useMemo(
    () => municipalities.find((item) => item.name === selected),
    [municipalities, selected],
  );

  const defined = municipality?.pricingStatus === "DEFINED";
  const base = defined ? municipality.transport : null;
  const vat = base != null ? Math.round(base * 0.19) : null;
  const companyTotal = base != null && vat != null ? base + vat : null;

  return (
    <div className="space-y-5">
      <label className="block text-sm font-semibold text-white">
        COMUNA DEL EVENTO
        <select
          className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#15171b] px-4 text-sm text-white outline-none focus:border-[#F78900]"
          onChange={(event) => setSelected(event.target.value)}
          value={selected}
        >
          <option value="">Selecciona una comuna</option>
          {municipalities.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {municipality ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#15171b]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
              {municipality.province}
            </p>
            <h2 className="mt-1 text-xl font-bold">{municipality.name}</h2>
          </div>

          {defined && base != null ? (
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F78900]">
                VALOR DE TRASLADO
              </p>
              <p className="mt-2 text-4xl font-black tracking-tight">
                {money.format(base)}
                {customerType === "company" ? (
                  <span className="ml-2 align-middle text-sm font-bold text-[#F78900]">+ IVA</span>
                ) : null}
              </p>

              {customerType === "company" ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                  <div className="flex justify-between gap-4 py-1">
                    <span className="text-white/50">Neto</span>
                    <strong>{money.format(base)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <span className="text-white/50">IVA 19%</span>
                    <strong>{money.format(vat ?? 0)}</strong>
                  </div>
                  <div className="mt-2 flex justify-between gap-4 border-t border-white/10 pt-3">
                    <span className="font-semibold">Total con IVA</span>
                    <strong className="text-[#F78900]">{money.format(companyTotal ?? 0)}</strong>
                  </div>
                </div>
              ) : (
                
              )}
            </div>
          ) : (
            <div className="p-5">
              <p className="text-lg font-bold">Valor por confirmar</p>
              <p className="mt-2 text-sm leading-6 text-white/60">
                BOOMBOX revisará esta ubicación antes de confirmar la reserva.
              </p>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">
          Selecciona una comuna para consultar el traslado.
        </div>
      )}

      <p className="text-center text-xs leading-5 text-white/40">
        {customerType === "company"
          ? "Cotización Empresa · valor neto + IVA."
          : "Valor de traslado según comuna seleccionada."}
      </p>
    </div>
  );
}
