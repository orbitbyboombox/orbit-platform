import { formatChileanRut } from "@/lib/chile/rut";
import type { CompanySettings } from "@/features/company-settings/types";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type CollectionBankDetails = {
  companyLabel: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  rut: string;
  email: string;
};

export function resolveCollectionBankDetails(
  settings: CompanySettings,
): CollectionBankDetails {
  const bank = object(settings.pdfConfiguration.commercialBank);
  // Legal identity is the canonical value for payment instructions.  The
  // brand name is still available elsewhere, but must not replace the legal
  // company name in copy/paste bank details.
  const companyLabel =
    "PRODUCCIONES BOOMBOX COMPANY SPA";
  const bankName = text(bank.bankName) || "Banco no configurado";
  const accountType = text(bank.accountType) || "Cuenta Corriente";
  const accountNumber = text(bank.accountNumber) || "Sin número configurado";
  const email =
    text(bank.email) || settings.salesEmail || settings.supportEmail || "Sin correo configurado";
  const rut = formatChileanRut(settings.taxId) || settings.taxId || "Sin RUT configurado";

  return {
    companyLabel,
    bankName,
    accountType,
    accountNumber,
    rut,
    email,
  };
}

/** Shared display order for collection composer, visual preview and outgoing email. */
export function collectionBankRows(details: CollectionBankDetails): Array<[string, string]> {
  return [
    ["Titular de la cuenta", details.companyLabel],
    ["Banco", details.bankName],
    ["Tipo de cuenta", details.accountType],
    ["N° de cuenta", details.accountNumber],
    ["RUT", details.rut],
    ["Email", details.email],
  ];
}
