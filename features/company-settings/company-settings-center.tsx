"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileImage,
  FileText,
  Globe2,
  Mail,
  Palette,
  Save,
  Upload,
} from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import type { CompanySettings } from "./types";
import {
  updateCompanySettingsAction,
  uploadCompanyLogoAction,
} from "./actions";
import { formatQuoteOperationalConditions } from "@/features/commercial-hub/operational-conditions";

const groups = [
  { id: "identity", label: "Empresa", icon: Building2 },
  { id: "brand", label: "Marca y logos", icon: Palette },
  { id: "regional", label: "Impuestos y región", icon: Globe2 },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "documents", label: "Documentos y contratos", icon: FileText },
  { id: "surfaces", label: "Portal y Dashboard", icon: FileImage },
] as const;
const Input = ({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string | number;
  type?: string;
}) => (
  <label className="text-xs font-semibold text-muted">
    {label}
    <input
      className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm text-foreground"
      defaultValue={defaultValue}
      name={name}
      type={type}
    />
  </label>
);
const Json = ({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: Record<string, unknown>;
}) => (
  <label className="text-xs font-semibold text-muted">
    {label}
    <textarea
      className="mt-1 min-h-32 w-full rounded-xl border bg-background p-3 font-mono text-xs text-foreground"
      defaultValue={JSON.stringify(value, null, 2)}
      name={name}
    />
  </label>
);
const Textarea = ({
  name,
  label,
  description,
  defaultValue,
}: {
  name: string;
  label: string;
  description: string;
  defaultValue: string;
}) => (
  <label className="text-xs font-semibold text-muted">
    {label}
    <span className="mt-1 block font-normal leading-5">{description}</span>
    <textarea
      className="mt-2 min-h-72 w-full rounded-xl border bg-background p-3 text-sm leading-6 text-foreground"
      defaultValue={defaultValue}
      name={name}
    />
  </label>
);
function LogoUpload({
  field,
  label,
  url,
}: {
  field: string;
  label: string;
  url: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="rounded-xl border bg-background/40 p-4">
      <div className="flex items-center gap-3">
        <div className="relative size-16 overflow-hidden rounded-lg border bg-black/80">
          <Image alt="" className="object-contain" fill src={url} unoptimized />
        </div>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 max-w-60 truncate text-xs text-muted">{url}</p>
        </div>
      </div>
      <input
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="mt-3 block w-full text-xs text-muted"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      <ActionButton
        className="mt-3"
        disabled={pending || !file}
        icon={Upload}
        label={pending ? "Cargando…" : "Actualizar logo"}
        onClick={() =>
          start(async () => {
            if (!file) return;
            const data = new FormData();
            data.set("field", field);
            data.set("file", file);
            const result = await uploadCompanyLogoAction(data);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          })
        }
        type="button"
      />
      <p className="mt-2 text-xs text-muted">{message}</p>
    </div>
  );
}

export function CompanySettingsCenter({
  settings,
}: {
  settings: CompanySettings;
}) {
  const [active, setActive] =
    useState<(typeof groups)[number]["id"]>("identity");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const operationalConditions = formatQuoteOperationalConditions(
    settings.pdfConfiguration.commercialOperationalConditions,
  );
  return (
    <section className="space-y-6" id="company-settings">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Configuración · Empresa
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Centro de Configuración de Empresa
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Una sola identidad persistente para marca, documentos, correos, Google
          Workspace, impuestos y experiencias digitales.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <nav className="grid gap-2 sm:grid-cols-2 xl:block xl:space-y-1">
          {groups.map(({ id, label, icon: Icon }) => (
            <button
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium ${active === id ? "bg-foreground text-background" : "text-muted hover:bg-accent hover:text-foreground"}`}
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <form
          action={(data) =>
            start(async () => {
              const result = await updateCompanySettingsAction(data);
              setMessage(result.ok ? result.message : result.error);
            })
          }
          className="rounded-2xl border bg-card p-5 sm:p-7"
        >
          <input name="id" type="hidden" value={settings.id} />
          <input name="version" type="hidden" value={settings.version} />
          {active === "identity" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                defaultValue={settings.companyName}
                label="Empresa"
                name="companyName"
              />
              <Input
                defaultValue={settings.legalName}
                label="Razón social"
                name="legalName"
              />
              <Input
                defaultValue={settings.brandName}
                label="Marca"
                name="brandName"
              />
              <Input
                defaultValue={settings.productName}
                label="Producto"
                name="productName"
              />
              <Input
                defaultValue={settings.productVersion}
                label="Versión"
                name="productVersion"
              />
              <Input
                defaultValue={settings.developedBy}
                label="Desarrollado por"
                name="developedBy"
              />
              <Input
                defaultValue={settings.poweredBy}
                label="Tecnología"
                name="poweredBy"
              />
              <Input
                defaultValue={settings.website}
                label="Sitio web"
                name="website"
              />
              <Input
                defaultValue={settings.phone}
                label="Teléfono"
                name="phone"
              />
              <Input
                defaultValue={settings.address}
                label="Dirección"
                name="address"
              />
              <Input defaultValue={settings.city} label="Ciudad" name="city" />
              <Input
                defaultValue={settings.loginTagline}
                label="Mensaje de acceso"
                name="loginTagline"
              />
            </div>
          )}
          {active === "brand" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <LogoUpload
                  field="logo_url"
                  label="Logo principal"
                  url={settings.logoUrl}
                />
                <LogoUpload
                  field="isotype_url"
                  label="Isotipo"
                  url={settings.isotypeUrl}
                />
                <LogoUpload
                  field="document_logo_url"
                  label="Logo documentos"
                  url={settings.documentLogoUrl}
                />
                <LogoUpload
                  field="portal_logo_url"
                  label="Logo Portal"
                  url={settings.portalLogoUrl}
                />
                <LogoUpload
                  field="dashboard_logo_url"
                  label="Logo Dashboard"
                  url={settings.dashboardLogoUrl}
                />
                <LogoUpload
                  field="email_logo_url"
                  label="Logo Email"
                  url={settings.emailLogoUrl}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  defaultValue={settings.logoUrl}
                  label="URL logo principal"
                  name="logoUrl"
                />
                <Input
                  defaultValue={settings.isotypeUrl}
                  label="URL isotipo"
                  name="isotypeUrl"
                />
                <Input
                  defaultValue={settings.documentLogoUrl}
                  label="URL documentos"
                  name="documentLogoUrl"
                />
                <Input
                  defaultValue={settings.portalLogoUrl}
                  label="URL Portal"
                  name="portalLogoUrl"
                />
                <Input
                  defaultValue={settings.dashboardLogoUrl}
                  label="URL Dashboard"
                  name="dashboardLogoUrl"
                />
                <Input
                  defaultValue={settings.emailLogoUrl}
                  label="URL Email"
                  name="emailLogoUrl"
                />
                <Input
                  defaultValue={settings.primaryColor}
                  label="Color principal"
                  name="primaryColor"
                  type="color"
                />
                <Input
                  defaultValue={settings.accentColor}
                  label="Color de acento"
                  name="accentColor"
                  type="color"
                />
              </div>
            </div>
          )}
          {active === "regional" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                defaultValue={settings.taxId}
                label="RUT empresa"
                name="taxId"
              />
              <Input
                defaultValue={settings.taxName}
                label="Nombre impuesto"
                name="taxName"
              />
              <Input
                defaultValue={settings.taxRate}
                label="Tasa %"
                name="taxRate"
                type="number"
              />
              <Input
                defaultValue={settings.country}
                label="País"
                name="country"
              />
              <Input
                defaultValue={settings.locale}
                label="Locale"
                name="locale"
              />
              <Input
                defaultValue={settings.currency}
                label="Moneda"
                name="currency"
              />
              <Input
                defaultValue={settings.timezone}
                label="Zona horaria"
                name="timezone"
              />
              <Input
                defaultValue={settings.googleWorkspaceDomain}
                label="Dominio Google Workspace"
                name="googleWorkspaceDomain"
              />
            </div>
          )}
          {active === "emails" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                defaultValue={settings.supportEmail}
                label="Email soporte"
                name="supportEmail"
                type="email"
              />
              <Input
                defaultValue={settings.salesEmail}
                label="Email ventas"
                name="salesEmail"
                type="email"
              />
              <Input
                defaultValue={settings.operationsEmail}
                label="Email operaciones"
                name="operationsEmail"
                type="email"
              />
              <Input
                defaultValue={settings.emailSignature}
                label="Firma de email"
                name="emailSignature"
              />
              <Json
                label="Configuración de email"
                name="emailConfiguration"
                value={settings.emailConfiguration}
              />
            </div>
          )}
          {active === "documents" && (
            <div className="grid gap-4">
              <Input
                defaultValue={settings.contractFooter}
                label="Pie de contrato"
                name="contractFooter"
              />
              <Input
                defaultValue={settings.quotationFooter}
                label="Pie de cotización"
                name="quotationFooter"
              />
              <Input
                defaultValue={settings.driveRootFolder}
                label="Carpeta raíz de Drive"
                name="driveRootFolder"
              />
              <Textarea
                defaultValue={operationalConditions}
                description="Un bloque por condición, usando el formato Título: descripción. Se aplica a todas las cotizaciones nuevas."
                label="Condiciones Operacionales de Cotización"
                name="quoteOperationalConditions"
              />
              <Json
                label="Configuración de contratos"
                name="contractConfiguration"
                value={settings.contractConfiguration}
              />
              <Json
                label="Configuración PDF"
                name="pdfConfiguration"
                value={settings.pdfConfiguration}
              />
            </div>
          )}
          {active === "surfaces" && (
            <div className="grid gap-4">
              <Input
                defaultValue={settings.portalKicker}
                label="Etiqueta Portal"
                name="portalKicker"
              />
              <Input
                defaultValue={settings.portalWelcome}
                label="Bienvenida Portal"
                name="portalWelcome"
              />
              <Json
                label="Configuración Portal"
                name="portalConfiguration"
                value={settings.portalConfiguration}
              />
              <Json
                label="Configuración Dashboard"
                name="dashboardConfiguration"
                value={settings.dashboardConfiguration}
              />
            </div>
          )}
          <div className="hidden" aria-hidden="true">
            {active !== "identity" && (
              <>
                <input
                  name="companyName"
                  value={settings.companyName}
                  readOnly
                />
                <input name="legalName" value={settings.legalName} readOnly />
                <input name="brandName" value={settings.brandName} readOnly />
                <input
                  name="productName"
                  value={settings.productName}
                  readOnly
                />
                <input
                  name="productVersion"
                  value={settings.productVersion}
                  readOnly
                />
                <input
                  name="developedBy"
                  value={settings.developedBy}
                  readOnly
                />
                <input name="poweredBy" value={settings.poweredBy} readOnly />
                <input name="website" value={settings.website} readOnly />
                <input name="phone" value={settings.phone} readOnly />
                <input name="address" value={settings.address} readOnly />
                <input name="city" value={settings.city} readOnly />
                <input
                  name="loginTagline"
                  value={settings.loginTagline}
                  readOnly
                />
              </>
            )}
            {active !== "brand" && (
              <>
                <input name="logoUrl" value={settings.logoUrl} readOnly />
                <input name="isotypeUrl" value={settings.isotypeUrl} readOnly />
                <input
                  name="documentLogoUrl"
                  value={settings.documentLogoUrl}
                  readOnly
                />
                <input
                  name="portalLogoUrl"
                  value={settings.portalLogoUrl}
                  readOnly
                />
                <input
                  name="dashboardLogoUrl"
                  value={settings.dashboardLogoUrl}
                  readOnly
                />
                <input
                  name="emailLogoUrl"
                  value={settings.emailLogoUrl}
                  readOnly
                />
                <input
                  name="primaryColor"
                  value={settings.primaryColor}
                  readOnly
                />
                <input
                  name="accentColor"
                  value={settings.accentColor}
                  readOnly
                />
              </>
            )}
            {active !== "regional" && (
              <>
                <input name="taxId" value={settings.taxId} readOnly />
                <input name="taxName" value={settings.taxName} readOnly />
                <input name="taxRate" value={settings.taxRate} readOnly />
                <input name="country" value={settings.country} readOnly />
                <input name="locale" value={settings.locale} readOnly />
                <input name="currency" value={settings.currency} readOnly />
                <input name="timezone" value={settings.timezone} readOnly />
                <input
                  name="googleWorkspaceDomain"
                  value={settings.googleWorkspaceDomain}
                  readOnly
                />
              </>
            )}
            {active !== "emails" && (
              <>
                <input
                  name="supportEmail"
                  value={settings.supportEmail}
                  readOnly
                />
                <input name="salesEmail" value={settings.salesEmail} readOnly />
                <input
                  name="operationsEmail"
                  value={settings.operationsEmail}
                  readOnly
                />
                <input
                  name="emailSignature"
                  value={settings.emailSignature}
                  readOnly
                />
                <textarea
                  name="emailConfiguration"
                  value={JSON.stringify(settings.emailConfiguration)}
                  readOnly
                />
              </>
            )}
            {active !== "documents" && (
              <>
                <input
                  name="contractFooter"
                  value={settings.contractFooter}
                  readOnly
                />
                <input
                  name="quotationFooter"
                  value={settings.quotationFooter}
                  readOnly
                />
                <input
                  name="driveRootFolder"
                  value={settings.driveRootFolder}
                  readOnly
                />
                <textarea
                  name="quoteOperationalConditions"
                  value={operationalConditions}
                  readOnly
                />
                <textarea
                  name="contractConfiguration"
                  value={JSON.stringify(settings.contractConfiguration)}
                  readOnly
                />
                <textarea
                  name="pdfConfiguration"
                  value={JSON.stringify(settings.pdfConfiguration)}
                  readOnly
                />
              </>
            )}
            {active !== "surfaces" && (
              <>
                <input
                  name="portalKicker"
                  value={settings.portalKicker}
                  readOnly
                />
                <input
                  name="portalWelcome"
                  value={settings.portalWelcome}
                  readOnly
                />
                <textarea
                  name="portalConfiguration"
                  value={JSON.stringify(settings.portalConfiguration)}
                  readOnly
                />
                <textarea
                  name="dashboardConfiguration"
                  value={JSON.stringify(settings.dashboardConfiguration)}
                  readOnly
                />
              </>
            )}
          </div>
          <label className="mt-6 block text-xs font-semibold text-muted">
            Razón del cambio
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
              name="reason"
              placeholder="Obligatoria para auditoría"
              required
            />
          </label>
          <div className="mt-4 flex items-center gap-3">
            <ActionButton
              disabled={pending}
              icon={Save}
              label={pending ? "Guardando…" : "Guardar configuración"}
              type="submit"
            />
            <p className="text-sm text-muted">{message}</p>
          </div>
        </form>
      </div>
    </section>
  );
}
