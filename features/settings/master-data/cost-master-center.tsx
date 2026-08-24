"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useModuleManager } from "@/features/module-manager";
import {
  createOtherCostAction,
  deleteOtherCostAction,
  updateCostMasterAction,
} from "./cost-master.actions";
import type {
  CostMasterCategory,
  CostMasterRecord,
  TransportZoneAdministrationRecord,
} from "./types";

const money = (value: number | null, digits = 0) =>
  value === null
    ? "Por definir"
    : new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: digits,
      }).format(value);
const groups: ReadonlyArray<{
  category: CostMasterCategory;
  title: string;
  description: string;
}> = [
  {
    category: "PAPER",
    title: "Papel",
    description: "Costo de caja, rendimiento y costo unitario por fotografía.",
  },
  {
    category: "PHOTO_PRODUCTION",
    title: "Producción fotográfica",
    description: "Capacidad operativa editable por servicio y hora.",
  },
  {
    category: "OPERATOR",
    title: "Operadores",
    description:
      "Costo oficial por duración contratada, desde 2 hasta 10 horas.",
  },
  {
    category: "ASSEMBLY",
    title: "Montaje",
    description: "Montaje, desmontaje y servicio combinado.",
  },
  {
    category: "FUEL",
    title: "Combustible",
    description: "Costo predeterminado por evento.",
  },
  {
    category: "TRANSPORT_OVERRIDE",
    title: "Transporte real",
    description:
      "Costo real base y override manual opcional por Evento.",
  },
  {
    category: "BRANDING",
    title: "Branding",
    description: "Costo operacional neto por cada cara producida para el Evento.",
  },
  {
    category: "OTHER",
    title: "Otros costos",
    description: "Costos operacionales configurables sin límite.",
  },
];

function CostEditor({
  canEdit,
  record,
}: {
  canEdit: boolean;
  record: CostMasterRecord;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    record.amount === null ? "" : String(record.amount),
  );
  const [quantity, setQuantity] = useState(
    record.quantity === null ? "" : String(record.quantity),
  );
  const [enabled, setEnabled] = useState(record.enabled);
  const [description, setDescription] = useState(record.description);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const isPaperBox = record.code === "PAPER_BOX_COST";
  const derived = record.code === "COST_PER_PHOTO";
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{record.label}</p>
          <p className="mt-1 text-xs text-muted">
            {record.unit} · v{record.version}
          </p>
        </div>
        <StatusBadge
          label={enabled ? "Activo" : "Inactivo"}
          variant={enabled ? "success" : "neutral"}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          {derived ? "Costo editable por foto" : "Valor"}
          <input
            className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
            disabled={!canEdit}
            min="0"
            onChange={(event) => setAmount(event.target.value)}
            step={derived ? "0.0001" : "1"}
            type="number"
            value={amount}
          />
        </label>
        {isPaperBox ? (
          <label className="text-xs font-semibold text-muted">
            Fotos por caja
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
              disabled={!canEdit}
              min="1"
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              value={quantity}
            />
          </label>
        ) : (
          <div className="self-end rounded-xl border bg-background/40 p-3 text-sm">
            <span className="text-muted">Valor actual</span>
            <strong className="mt-1 block">
              {money(record.amount, derived ? 4 : 0)}
            </strong>
          </div>
        )}
      </div>
      {isPaperBox && (
        <p className="mt-3 text-xs text-muted">
          Valor IVA incluido. Al guardar se recalcula automáticamente el costo
          por foto.
        </p>
      )}
      <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm">
        <input
          checked={enabled}
          disabled={!canEdit}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        Disponible
      </label>
      {record.category === "BRANDING" && (
        <label className="mt-3 block text-xs font-semibold text-muted">
          Descripción
          <textarea
            className="mt-1 min-h-20 w-full rounded-xl border bg-background px-3 py-2 text-sm"
            disabled={!canEdit}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
      )}
      {canEdit && (
        <>
          <label className="mt-3 block text-xs font-semibold text-muted">
            Razón del cambio
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Obligatoria para auditoría"
              value={reason}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ActionButton
              disabled={pending || !reason.trim()}
              label={pending ? "Guardando…" : "Guardar costo"}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateCostMasterAction({
                    id: record.id,
                    expectedVersion: record.version,
                    amount: amount === "" ? null : Number(amount),
                    quantity: quantity === "" ? null : Number(quantity),
                    enabled,
                    description,
                    reason,
                  });
                  setMessage(
                    result.ok ? "Costo guardado y auditado." : result.error,
                  );
                  if (result.ok) router.refresh();
                })
              }
            />
            {record.category === "OTHER" && (
              <button
                aria-label={`Eliminar ${record.label}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm text-danger"
                onClick={() => {
                  const deleteReason = window.prompt("Motivo de eliminación:");
                  if (!deleteReason) return;
                  startTransition(async () => {
                    const result = await deleteOtherCostAction({
                      id: record.id,
                      expectedVersion: record.version,
                      reason: deleteReason,
                    });
                    setMessage(
                      result.ok ? "Costo eliminado y auditado." : result.error,
                    );
                    if (result.ok) router.refresh();
                  });
                }}
                type="button"
              >
                <Trash2 className="size-4" />
                Eliminar
              </button>
            )}
            <span className="text-xs text-muted" role="status">
              {message}
            </span>
          </div>
        </>
      )}
    </article>
  );
}

function OtherCostForm({ onSaved }: { onSaved: (message: string) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("CLP/EVENTO");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="rounded-2xl border border-brand/25 bg-brand/5 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createOtherCostAction({
            label: name,
            amount: Number(amount),
            unit,
            reason,
          });
          onSaved(result.ok ? "Costo creado y auditado." : result.error);
          if (result.ok) {
            setName("");
            setAmount("");
            setReason("");
          }
        });
      }}
    >
      <div className="flex items-center gap-2">
        <Plus className="size-4 text-brand" />
        <h4 className="font-semibold">Agregar costo operacional</h4>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" onChange={setName} value={name} />
        <Field
          label="Monto"
          onChange={setAmount}
          type="number"
          value={amount}
        />
        <Field label="Unidad" onChange={setUnit} value={unit} />
        <Field label="Razón del cambio" onChange={setReason} value={reason} />
      </div>
      <ActionButton
        className="mt-4"
        disabled={pending || !name.trim() || !amount || !reason.trim()}
        label={pending ? "Creando…" : "Crear costo"}
        type="submit"
      />
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs font-semibold text-muted">
      {label}
      <input
        className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}

export function CostMasterCenter({
  canEdit,
  records,
  transportZones,
}: {
  canEdit: boolean;
  records: readonly CostMasterRecord[];
  transportZones: readonly TransportZoneAdministrationRecord[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const { isEnabled } = useModuleManager();
  const visibleGroups = groups.filter((group) => group.category !== "PAPER" || isEnabled("PAPER_CONSUMPTION")).filter((group) => group.category !== "FUEL" || isEnabled("FUEL_CONTROL"));
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label="Fuente oficial de costos" variant="success" />
        <span className="text-xs text-muted">
          Cada cambio conserva usuario, fecha, valor anterior y valor nuevo.
        </span>
      </div>
      {visibleGroups.map((group) => (
        <section className="space-y-4" key={group.category}>
          <div>
            <h3 className="text-lg font-semibold">{group.title}</h3>
            <p className="mt-1 text-sm text-muted">{group.description}</p>
          </div>
          {group.category === "TRANSPORT_OVERRIDE" && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {transportZones
                .filter((zone) => zone.enabled)
                .map((zone) => (
                  <div
                    className="rounded-xl border bg-card p-3 text-sm"
                    key={zone.id}
                  >
                    <span className="text-muted">{zone.province}</span>
                    <strong className="mt-1 block">
                      {money(zone.transportValue)}
                    </strong>
                  </div>
                ))}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {records
              .filter((record) => record.category === group.category)
              .map((record) => (
                <CostEditor
                  canEdit={canEdit}
                  key={`${record.id}-${record.version}`}
                  record={record}
                />
              ))}
          </div>
          {group.category === "OTHER" && canEdit && (
            <OtherCostForm
              onSaved={(value) => {
                setMessage(value);
                router.refresh();
              }}
            />
          )}
        </section>
      ))}
      <p className="text-sm text-muted" role="status">
        {message}
      </p>
    </div>
  );
}
