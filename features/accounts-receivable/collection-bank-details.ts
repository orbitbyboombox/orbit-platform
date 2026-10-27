import type { CompanySettings } from "@/features/company-settings/types";
import { OFFICIAL_BOOMBOX_BANK_DETAILS } from "@/features/company-settings/bank-details";

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
  // Keep the settings argument in the API so callers remain compatible, but
  // do not let stale company_settings values leak into payment instructions.
  void settings;
  return { ...OFFICIAL_BOOMBOX_BANK_DETAILS };
}
