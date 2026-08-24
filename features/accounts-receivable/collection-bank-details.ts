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
  const companyLabel =
    settings.brandName || settings.legalName || settings.companyName || "BOOMBOX";
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
