"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Upload } from "lucide-react";

type Invitation = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  status: string;
  reviewNotes: string | null;
  data: Record<string, unknown>;
};
const steps = [
  "Información personal",
  "Contacto",
  "Datos bancarios",
  "Documentos",
];
const documentFields = [
  ["identityFront", "IDENTITY_FRONT", "Cédula · frente"],
  ["identityBack", "IDENTITY_BACK", "Cédula · reverso"],
  ["licenseFront", "DRIVER_LICENSE_FRONT", "Licencia · frente"],
  ["licenseBack", "DRIVER_LICENSE_BACK", "Licencia · reverso"],
] as const;
type UploadedDocument = {
  documentType: string;
  path: string;
  fileName: string;
  mimeType: string;
};

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`El servidor respondió con un error (${response.status}).`);
  }
}

export function StaffOnboardingForm({
  invitation,
  token,
}: {
  invitation: Invitation;
  token: string;
}) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [submitted, setSubmitted] = useState(invitation.status === "SUBMITTED");
  const [data, setData] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.entries(invitation.data).filter(
          ([, value]) => typeof value === "string",
        ),
      ) as Record<string, string>,
  );
  const [capabilities, setCapabilities] = useState<string[]>(
    Array.isArray(invitation.data.capabilities)
      ? invitation.data.capabilities.map(String)
      : [],
  );
  const [canDrive, setCanDrive] = useState(Boolean(invitation.data.canDrive));
  const update = (key: string, value: string) =>
    setData((current) => ({ ...current, [key]: value }));
  const requiresLicense =
    canDrive ||
    capabilities.some((item) => item === "ASSEMBLY" || item === "DISASSEMBLY");
  const submit = async (form: FormData) => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 120_000);
    abortRef.current = controller;
    const uploaded: UploadedDocument[] = [];
    setPending(true);
    setError("");
    setUploadProgress(0);
    try {
      const files = documentFields
        .filter(([field]) =>
          field.startsWith("license") ? requiresLicense : true,
        )
        .map(([field, documentType, label]) => ({
          documentType,
          label,
          file: form.get(field),
        }));
      for (const item of files) {
        if (!(item.file instanceof File) || item.file.size === 0)
          throw new Error(`Adjunta ${item.label.toLowerCase()}.`);
      }
      const totalSteps = files.length + 1;
      for (let index = 0; index < files.length; index += 1) {
        const item = files[index];
        const file = item.file as File;
        setUploadLabel(`Subiendo ${item.label.toLowerCase()}…`);
        const authorization = await fetch("/api/staff-onboarding/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            documentType: item.documentType,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
          }),
          signal: controller.signal,
        });
        const authorizationResult = await readJson(authorization);
        if (!authorization.ok)
          throw new Error(
            String(
              authorizationResult.message ??
                `No se pudo cargar ${item.label.toLowerCase()}.`,
            ),
          );
        const path = String(authorizationResult.path ?? "");
        const signedUrl = String(authorizationResult.signedUrl ?? "");
        if (!path || !signedUrl)
          throw new Error(`No se pudo cargar ${item.label.toLowerCase()}.`);
        const uploadBody = new FormData();
        uploadBody.append("cacheControl", "3600");
        uploadBody.append("", file);
        const upload = await fetch(signedUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: uploadBody,
          signal: controller.signal,
        });
        if (!upload.ok) {
          const uploadError = await readJson(upload).catch(
            () => ({}) as Record<string, unknown>,
          );
          throw new Error(
            String(
              uploadError.message ??
                `Storage rechazó ${item.label.toLowerCase()} (${upload.status}).`,
            ),
          );
        }
        uploaded.push({
          documentType: item.documentType,
          path,
          fileName: file.name,
          mimeType: file.type,
        });
        setUploadProgress(Math.round(((index + 1) / totalSteps) * 100));
      }
      setUploadLabel("Creando solicitud de onboarding…");
      const response = await fetch("/api/staff-onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          documents: uploaded,
          payload: {
        ...data,
        capabilities,
        canDrive,
        phone: data.phone || invitation.mobile,
          },
        }),
        signal: controller.signal,
      });
      const result = await readJson(response);
      if (!response.ok)
        throw new Error(
          String(result.message ?? "No fue posible enviar tu información."),
        );
      setUploadProgress(100);
      setSubmitted(true);
    } catch (cause) {
      if (uploaded.length)
        void fetch("/api/staff-onboarding/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            paths: uploaded.map((document) => document.path),
          }),
        });
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? timedOut
            ? "La carga superó el tiempo máximo. Revisa tu conexión e inténtalo nuevamente."
            : "El envío fue cancelado. Puedes intentarlo nuevamente."
          : cause instanceof Error
            ? cause.message
            : "No fue posible enviar tu información.",
      );
    } finally {
      window.clearTimeout(timeout);
      abortRef.current = null;
      setPending(false);
      setUploadLabel("");
    }
  };
  if (submitted)
    return (
      <Shell>
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h1 className="mt-5 text-3xl font-semibold">Registro enviado</h1>
          <p className="mx-auto mt-3 max-w-lg text-muted">
            Tu información quedó pendiente de revisión. BOOMBOX te avisará
            cuando tu perfil y Portal Staff estén habilitados.
          </p>
        </div>
      </Shell>
    );
  return (
    <Shell>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Onboarding Staff BOOMBOX
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Hola, {invitation.firstName}.
        </h1>
        <p className="mt-2 text-muted">
          Completa tu registro seguro. Paso {step + 1} de {steps.length}:{" "}
          {steps[step]}.
        </p>
      </header>
      {invitation.reviewNotes ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <strong>Cambios solicitados:</strong> {invitation.reviewNotes}
        </div>
      ) : null}
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted/20">
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>
      <form
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}
      >
        {step === 0 ? <Personal data={data} update={update} /> : null}
        {step === 1 ? (
          <Contact data={data} email={invitation.email} update={update} />
        ) : null}
        {step === 2 ? <Bank data={data} update={update} /> : null}
        {step === 3 ? (
          <Documents
            canDrive={canDrive}
            capabilities={capabilities}
            requiresLicense={requiresLicense}
            setCanDrive={setCanDrive}
            setCapabilities={setCapabilities}
          />
        ) : null}
        {error ? (
          <p className="mt-5 text-sm font-medium text-red-500" role="alert">
            {error}
          </p>
        ) : null}
        {pending ? (
          <div className="mt-5" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{uploadLabel}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/20">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-7 flex justify-between gap-3">
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-semibold disabled:opacity-40"
            disabled={step === 0 || pending}
            type="button"
            onClick={() => setStep((value) => value - 1)}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </button>
          {step < steps.length - 1 ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground"
              type="button"
              onClick={() => setStep((value) => value + 1)}
            >
              Continuar
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <div className="flex gap-3">
              {pending ? (
                <button
                  className="min-h-11 rounded-xl border px-5 font-semibold"
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancelar
                </button>
              ) : null}
              <button
                className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-foreground"
                disabled={pending || capabilities.length === 0}
              >
                {pending
                  ? "Enviando…"
                  : error
                    ? "Reintentar envío"
                    : "Enviar para revisión"}
              </button>
            </div>
          )}
        </div>
      </form>
    </Shell>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-2xl sm:p-9">
      {children}
    </section>
  );
}
function Input({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = true,
  readOnly = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
        name={name}
        required={required}
        readOnly={readOnly}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Personal({
  data,
  update,
}: {
  data: Record<string, string>;
  update: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Nombre"
        name="firstName"
        value={data.firstName ?? ""}
        onChange={(value) => update("firstName", value)}
      />
      <Input
        label="Apellido"
        name="lastName"
        value={data.lastName ?? ""}
        onChange={(value) => update("lastName", value)}
      />
      <Input
        label="RUT"
        name="rut"
        value={data.rut ?? ""}
        onChange={(value) => update("rut", value)}
      />
      <Input
        label="Fecha de nacimiento"
        name="birthDate"
        type="date"
        value={data.birthDate ?? ""}
        onChange={(value) => update("birthDate", value)}
      />
      <Input
        label="Dirección"
        name="address"
        value={data.address ?? ""}
        onChange={(value) => update("address", value)}
      />
      <Input
        label="Comuna"
        name="district"
        value={data.district ?? ""}
        onChange={(value) => update("district", value)}
      />
      <Input
        label="Ciudad"
        name="city"
        value={data.city ?? ""}
        onChange={(value) => update("city", value)}
      />
    </div>
  );
}
function Contact({
  data,
  email,
  update,
}: {
  data: Record<string, string>;
  email: string;
  update: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Teléfono"
        name="phone"
        type="tel"
        value={data.phone ?? ""}
        onChange={(value) => update("phone", value)}
      />
      <Input
        label="Email"
        name="email"
        type="email"
        value={email}
        readOnly
        onChange={() => {}}
      />
      <Input
        label="Contacto de emergencia"
        name="emergencyName"
        value={data.emergencyName ?? ""}
        onChange={(value) => update("emergencyName", value)}
      />
      <Input
        label="Teléfono de emergencia"
        name="emergencyPhone"
        type="tel"
        value={data.emergencyPhone ?? ""}
        onChange={(value) => update("emergencyPhone", value)}
      />
    </div>
  );
}
function Bank({
  data,
  update,
}: {
  data: Record<string, string>;
  update: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Banco"
        name="bank"
        value={data.bank ?? ""}
        onChange={(value) => update("bank", value)}
      />
      <Input
        label="Tipo de cuenta"
        name="accountType"
        value={data.accountType ?? ""}
        onChange={(value) => update("accountType", value)}
      />
      <Input
        label="Número de cuenta"
        name="accountNumber"
        value={data.accountNumber ?? ""}
        onChange={(value) => update("accountNumber", value)}
      />
      <Input
        label="Titular de la cuenta"
        name="accountHolder"
        value={data.accountHolder ?? ""}
        onChange={(value) => update("accountHolder", value)}
      />
    </div>
  );
}
function Documents({
  capabilities,
  setCapabilities,
  canDrive,
  setCanDrive,
  requiresLicense,
}: {
  capabilities: string[];
  setCapabilities: (value: string[]) => void;
  canDrive: boolean;
  setCanDrive: (value: boolean) => void;
  requiresLicense: boolean;
}) {
  const toggle = (value: string) =>
    setCapabilities(
      capabilities.includes(value)
        ? capabilities.filter((item) => item !== value)
        : [...capabilities, value],
    );
  return (
    <div>
      <h2 className="text-lg font-semibold">Funciones operacionales</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {[
          ["OPERATOR", "Operador"],
          ["ASSEMBLY", "Montaje"],
          ["DISASSEMBLY", "Desmontaje"],
        ].map(([value, label]) => (
          <label
            className="flex min-h-11 items-center gap-2 rounded-xl border px-4"
            key={value}
          >
            <input
              checked={capabilities.includes(value)}
              type="checkbox"
              onChange={() => toggle(value)}
            />
            {label}
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-2 rounded-xl border px-4">
          <input
            checked={canDrive}
            type="checkbox"
            onChange={(event) => setCanDrive(event.target.checked)}
          />
          Conduce vehículos BOOMBOX
        </label>
      </div>
      <h2 className="mt-6 text-lg font-semibold">Documentos</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <FileField label="Cédula · frente" name="identityFront" />
        <FileField label="Cédula · reverso" name="identityBack" />
        {requiresLicense ? (
          <>
            <FileField label="Licencia · frente" name="licenseFront" />
            <FileField label="Licencia · reverso" name="licenseBack" />
          </>
        ) : null}
      </div>
    </div>
  );
}
function FileField({ label, name }: { label: string; name: string }) {
  return (
    <label className="rounded-xl border border-dashed p-4 text-sm font-medium">
      <Upload className="mb-2 size-5 text-brand" />
      {label}
      <input
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="mt-3 block w-full text-xs"
        name={name}
        required
        type="file"
      />
    </label>
  );
}
